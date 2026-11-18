const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const Order = require('../models/Order');
const Shipment = require('../models/Shipment');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const { bumpCourierMetric } = require('../services/shipping/courierAssignment');
const {
  normalizeShipmentStatus,
  recordShipmentEvent,
} = require('../services/shipping/shipmentLifecycleService');

const isProduction = () => process.env.NODE_ENV === 'production';
const text = value => String(value ?? '').trim();
const firstValue = (...values) => values.map(text).find(Boolean) || '';

const rawRequestBody = req => (Buffer.isBuffer(req.body)
  ? req.body
  : Buffer.from(JSON.stringify(req.body || {}), 'utf8'));

const parsePayload = raw => {
  try {
    const value = JSON.parse(raw.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Webhook payload must be an object');
    return value;
  } catch (error) {
    const safe = new Error('Invalid Shiprocket webhook JSON');
    safe.statusCode = 400;
    throw safe;
  }
};

const timingSafeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

const verifySignature = ({ raw, headers, secret }) => {
  if (!secret) return !isProduction();
  const signature = firstValue(
    headers['x-shiprocket-signature'],
    headers['x-shiprocket-hmac'],
    headers['x-signature'],
  ).replace(/^sha256=/i, '');
  if (signature) {
    const expected = [
      crypto.createHmac('sha256', secret).update(raw).digest('hex'),
      crypto.createHmac('sha256', secret).update(raw).digest('base64'),
      crypto.createHmac('sha256', secret).update(raw).digest('base64url'),
    ];
    return expected.some(candidate => timingSafeEqual(candidate, signature));
  }
  // Preserve the existing shared-secret header contract while accepting the
  // stronger raw-body HMAC contract for new provider configurations.
  return timingSafeEqual(headers['x-shiprocket-secret'], secret);
};

const identifiersFrom = payload => {
  const awb = firstValue(payload.awb, payload.awb_code, payload.awbCode, payload.waybill);
  const shipmentId = firstValue(payload.shipment_id, payload.shipmentId, payload.external_shipment_id);
  const orderId = firstValue(payload.order_id, payload.orderId, payload.external_order_id);
  const eventId = firstValue(payload.event_id, payload.eventId, payload.webhook_id, payload.id);
  return { awb, shipmentId, orderId, eventId };
};

const numeric = value => {
  if (!value || !/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const findTargetShipment = async ({ awb, shipmentId, orderId }) => {
  const clauses = [];
  if (awb) clauses.push({ trackingNumber: awb });
  if (shipmentId) clauses.push({ externalShipmentId: shipmentId });
  if (orderId) clauses.push({ externalOrderId: orderId });
  if (!clauses.length) return null;
  const matches = await Shipment.find({ provider: 'shiprocket', $or: clauses }).sort({ updatedAt: -1 }).limit(2).lean();
  if (matches.length > 1) {
    const error = new Error('Webhook identifiers match multiple tenant shipments');
    error.statusCode = 409;
    error.publicCode = 'SHIPMENT_WEBHOOK_AMBIGUOUS';
    throw error;
  }
  return matches[0] || null;
};

const findTargetOrder = async ({ awb, shipmentId, orderId }) => {
  const clauses = [];
  if (awb) clauses.push({ awbCode: awb });
  if (shipmentId && numeric(shipmentId) !== null) clauses.push({ shiprocketShipmentId: numeric(shipmentId) });
  if (orderId) {
    if (numeric(orderId) !== null) clauses.push({ shiprocketOrderId: numeric(orderId) });
    clauses.push({ orderNumber: orderId });
  }
  if (!clauses.length) return null;
  const matches = await Order.find({ $or: clauses }).sort({ updatedAt: -1 }).limit(2).lean();
  if (matches.length > 1) {
    const error = new Error('Webhook identifiers match multiple orders');
    error.statusCode = 409;
    error.publicCode = 'SHIPMENT_WEBHOOK_AMBIGUOUS';
    throw error;
  }
  return matches[0] || null;
};

const ensureShipment = async ({ order, shipment, awb, shipmentId, orderId }) => {
  if (shipment) return shipment;
  return Shipment.findOneAndUpdate(
    { tenant: order.tenant, order: order._id, provider: 'shiprocket' },
    {
      $setOnInsert: {
        tenant: order.tenant,
        order: order._id,
        provider: 'shiprocket',
        idempotencyKey: `legacy-webhook:${order._id}`,
        status: 'created',
        externalOrderId: orderId,
        externalShipmentId: shipmentId,
        trackingNumber: awb || order.awbCode || order.trackingNumber || '',
        courierName: order.courierName || '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
};

const updateLegacyOrderSnapshot = async ({ order, payload, awb, shipmentId, orderId, courierName, etd }) => {
  const update = {
    shippingProvider: 'shiprocket',
    shiprocketLastSync: new Date(),
    shippingLastSync: new Date(),
    ...(payload.current_status || payload.status ? { shiprocketStatus: firstValue(payload.current_status, payload.status) } : {}),
    ...(courierName ? { courierName } : {}),
    ...(awb ? { awbCode: awb, trackingNumber: awb } : {}),
    ...(shipmentId ? { shippingExternalShipmentId: shipmentId, ...(numeric(shipmentId) !== null ? { shiprocketShipmentId: numeric(shipmentId) } : {}) } : {}),
    ...(orderId ? { shippingExternalOrderId: orderId, ...(numeric(orderId) !== null ? { shiprocketOrderId: numeric(orderId) } : {}) } : {}),
  };
  if (etd) {
    const estimated = new Date(etd);
    if (!Number.isNaN(estimated.getTime())) update.estimatedDelivery = estimated;
  }
  await Order.updateOne({ _id: order._id, tenant: order.tenant }, { $set: update });
};

// @desc    Receive a signed Shiprocket webhook and reconcile the provider-neutral shipment ledger
// @route   POST /api/webhooks/shiprocket
const handleShiprocketWebhook = asyncHandler(async (req, res) => {
  const raw = rawRequestBody(req);
  const payload = parsePayload(raw);
  const { awb, shipmentId, orderId, eventId } = identifiersFrom(payload);
  if (!awb && !orderId && !shipmentId) {
    res.status(400);
    throw new Error('No shipment, AWB, or order identifier in payload');
  }

  const targetShipment = await findTargetShipment({ awb, shipmentId, orderId });
  const targetOrder = targetShipment
    ? await Order.findOne({ _id: targetShipment.order, tenant: targetShipment.tenant }).lean()
    : await findTargetOrder({ awb, shipmentId, orderId });

  if (!targetOrder || !targetOrder.tenant) {
    return res.status(202).json({ success: true, ignored: true, reason: 'tenant_order_not_found' });
  }

  const config = await tenantIntegrationService.configFor(targetOrder.tenant, 'shiprocket', { allowPlatformFallback: true });
  const secret = text(config.webhook_secret);
  if (isProduction() && (!config.enabled || !secret)) {
    return res.status(503).json({ success: false, code: 'SHIPMENT_WEBHOOK_NOT_CONFIGURED', message: 'Shiprocket webhook is not configured' });
  }
  if (!verifySignature({ raw, headers: req.headers || {}, secret })) {
    return res.status(401).json({ success: false, code: 'SHIPMENT_WEBHOOK_SIGNATURE_INVALID', message: 'Invalid Shiprocket webhook signature' });
  }

  const shipment = await ensureShipment({ order: targetOrder, shipment: targetShipment, awb, shipmentId, orderId });
  const currentStatus = firstValue(payload.current_status, payload.currentStatus, payload.status, payload.status_code);
  const courierName = firstValue(payload.courier_name, payload.courierName, targetOrder.courierName);
  const eventAt = payload.event_at || payload.eventAt || payload.updated_at || payload.updatedAt || payload.etd;
  const stableEventId = eventId || `body:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 48)}`;
  const normalizedStatus = currentStatus ? normalizeShipmentStatus(currentStatus) : '';
  const result = normalizedStatus
    ? await recordShipmentEvent({
      shipmentId: shipment._id,
      tenant: targetOrder.tenant,
      status: normalizedStatus,
      eventKey: `webhook:${stableEventId}`,
      providerEventId: stableEventId,
      description: currentStatus,
      location: firstValue(payload.location, payload.current_location, payload.currentLocation),
      eventAt,
      source: 'webhook',
      raw: payload,
      trackingNumber: awb || shipment.trackingNumber,
      courierName,
      allowHistorical: true,
    })
    : { shipment, event: null, order: null, idempotent: true, historical: false };

  await Shipment.updateOne(
    { _id: shipment._id, tenant: targetOrder.tenant },
    {
      $set: {
        tracking: payload,
        lastSyncedAt: new Date(),
        ...(awb ? { trackingNumber: awb } : {}),
        ...(shipmentId ? { externalShipmentId: shipmentId } : {}),
        ...(orderId ? { externalOrderId: orderId } : {}),
        ...(courierName ? { courierName } : {}),
      },
    },
  );
  await updateLegacyOrderSnapshot({ order: targetOrder, payload, awb, shipmentId, orderId, courierName, etd: payload.etd });

  // Metrics remain best-effort, but only a newly claimed event may increment
  // them. Replayed provider deliveries therefore cannot double count.
  if (currentStatus && targetOrder.courierCompanyId && !result.idempotent) {
    const metricKey = eventId ? `WEBHOOK:${eventId}` : String(currentStatus).toUpperCase();
    const claimed = await Order.findOneAndUpdate(
      { _id: targetOrder._id, tenant: targetOrder.tenant, 'shiprocketProcessedEvents.status': { $ne: metricKey } },
      { $push: { shiprocketProcessedEvents: { status: metricKey, at: new Date() } } },
      { new: false },
    );
    if (claimed) await bumpCourierMetric(targetOrder.courierCompanyId, currentStatus, courierName);
  }

  const refreshed = await Shipment.findOne({ _id: shipment._id, tenant: targetOrder.tenant }).select('_id tenant order provider status trackingNumber courierName lastEventAt lastSyncedAt').lean();
  return res.json({
    success: true,
    message: 'Webhook processed',
    eventId: stableEventId,
    idempotent: Boolean(result.idempotent),
    historical: Boolean(result.historical),
    shipment: refreshed,
    event: result.event ? {
      _id: result.event._id,
      providerEventId: result.event.providerEventId,
      status: result.event.status,
      source: result.event.source,
      eventAt: result.event.eventAt,
    } : null,
  });
});

module.exports = { handleShiprocketWebhook, verifySignature, identifiersFrom };
