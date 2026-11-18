const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Shipment = require('../models/Shipment');
const ShipmentEvent = require('../models/ShipmentEvent');
const shippingProviderManager = require('../services/shipping/providerManager');
const { getActiveProvider, assertActiveProvider } = require('../services/providerSelectionService');
const {
  SHIPMENT_STATUSES,
  normalizeShipmentStatus,
  recordShipmentEvent,
  recordProviderTracking,
} = require('../services/shipping/shipmentLifecycleService');

const scoped = (req, base = {}) => ({
  ...base,
  ...(req.tenant ? { tenant: req.tenant._id } : {}),
});

const shipmentFields = [
  '_id', 'tenant', 'order', 'provider', 'status', 'externalOrderId',
  'externalShipmentId', 'trackingNumber', 'courierName', 'trackingUrl',
  'lastEventAt', 'lastSyncedAt', 'tracking', 'rates', 'error', 'createdAt',
  'updatedAt',
].join(' ');

const publicShipment = shipment => {
  if (!shipment) return null;
  const value = typeof shipment.toObject === 'function' ? shipment.toObject() : { ...shipment };
  delete value.raw;
  delete value.error;
  return {
    _id: value._id,
    order: value.order,
    provider: value.provider,
    status: value.status,
    externalOrderId: value.externalOrderId,
    externalShipmentId: value.externalShipmentId,
    trackingNumber: value.trackingNumber,
    courierName: value.courierName,
    trackingUrl: value.trackingUrl,
    lastEventAt: value.lastEventAt,
    lastSyncedAt: value.lastSyncedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const publicEvent = event => ({
  _id: event._id,
  shipment: event.shipment,
  order: event.order,
  provider: event.provider,
  providerEventId: event.providerEventId,
  status: event.status,
  description: event.description,
  location: event.location,
  eventAt: event.eventAt,
  source: event.source,
  createdAt: event.createdAt,
});

const listShipmentEvents = shipmentId => ShipmentEvent.find({ shipment: shipmentId })
  .sort({ eventAt: -1, createdAt: -1 })
  .lean();

const ensureCreateEvent = async (shipment, tenant) => recordShipmentEvent({
  shipmentId: shipment._id,
  tenant,
  status: shipment.status || 'created',
  eventKey: `create:${shipment.idempotencyKey}`,
  description: 'Shipment record created',
  source: 'system',
  trackingNumber: shipment.trackingNumber,
  courierName: shipment.courierName,
  raw: {},
});

const createShipment = asyncHandler(async (req, res) => {
  const { orderId, weight = 0.5, length, breadth, height } = req.body || {};
  if (!orderId) { res.status(400); throw new Error('orderId is required'); }
  const query = scoped(req, { _id: orderId });
  const order = await Order.findOne(query).populate('items.product', 'title sku weight');
  if (!order) { res.status(404); throw new Error('Order not found'); }
  const requestedProvider = String(req.body?.provider || '').trim().toLowerCase();
  const normalizedProvider = requestedProvider || await getActiveProvider('shipping');
  if (!normalizedProvider) {
    const error = new Error('No shipping provider is active. Orders will be processed manually.');
    error.statusCode = 409;
    error.publicCode = 'SHIPPING_PROVIDER_INACTIVE';
    throw error;
  }
  await assertActiveProvider('shipping', normalizedProvider);
  const idempotencyKey = req.headers['idempotency-key'] || `shipment:${order._id}:${normalizedProvider}`;
  const shipmentQuery = scoped(req, { order: order._id, provider: normalizedProvider });
  const existing = await Shipment.findOne(shipmentQuery);
  if (existing && existing.status !== 'failed') {
    await ensureCreateEvent(existing, req.tenant?._id);
    const events = await listShipmentEvents(existing._id);
    return res.json({ success: true, shipment: existing, events, idempotent: true });
  }
  const record = await Shipment.findOneAndUpdate(
    shipmentQuery,
    { $setOnInsert: { tenant: req.tenant?._id, order: order._id, provider: normalizedProvider, idempotencyKey, status: 'creating', createdBy: req.user?._id } },
    { upsert: true, new: true },
  );
  if (record.status !== 'creating' && record.status !== 'failed') {
    await ensureCreateEvent(record, req.tenant?._id);
    return res.json({ success: true, shipment: record, events: await listShipmentEvents(record._id), idempotent: true });
  }
  try {
    const result = await shippingProviderManager.createShipment({
      tenantId: req.tenant?._id,
      provider: normalizedProvider,
      data: {
        orderId: order.orderNumber || order._id.toString(),
        customerName: order.shippingAddress.fullName,
        customerEmail: req.user?.email,
        address: order.shippingAddress,
        items: order.items.map(item => ({ title: item.title, sku: item.sku, quantity: item.quantity, price: item.price })),
        total: order.total,
        paymentMethod: order.paymentMethod,
        weight,
        length,
        breadth,
        height,
      },
    });
    const trackingNumber = result.awbCode || result.waybill || result.awbNumber || '';
    const updated = await Shipment.findOneAndUpdate(
      scoped(req, { _id: record._id }),
      { $set: { status: 'created', externalOrderId: String(result.orderId || ''), externalShipmentId: String(result.shipmentId || ''), trackingNumber, courierName: result.courierName || '', raw: result, error: '' } },
      { new: true },
    );
    await recordShipmentEvent({
      shipmentId: updated._id,
      tenant: req.tenant?._id,
      status: 'created',
      eventKey: `create:${idempotencyKey}`,
      description: 'Shipment created with shipping provider',
      source: 'system',
      trackingNumber,
      courierName: result.courierName || '',
      raw: result,
    });
    const orderUpdate = {
      shippingProvider: normalizedProvider,
      shippingExternalOrderId: String(result.orderId || ''),
      shippingExternalShipmentId: String(result.shipmentId || ''),
      shippingStatus: 'created',
      shippingLastSync: new Date(),
      ...(trackingNumber ? { trackingNumber, awbCode: trackingNumber } : {}),
      ...(normalizedProvider === 'shiprocket' && result.orderId ? { shiprocketOrderId: result.orderId, shiprocketShipmentId: result.shipmentId, shiprocketStatus: result.status } : {}),
    };
    if (!['delivered', 'cancelled', 'returned'].includes(order.orderStatus)) orderUpdate.orderStatus = 'shipped';
    await Order.updateOne(scoped(req, { _id: order._id }), { $set: orderUpdate });
    const finalShipment = await Shipment.findById(updated._id).select(shipmentFields);
    res.json({ success: true, shipment: finalShipment, events: await listShipmentEvents(finalShipment._id), trackingId: finalShipment.trackingNumber });
  } catch (error) {
    await Shipment.findOneAndUpdate(scoped(req, { _id: record._id }), { $set: { status: 'failed', error: String(error.message || 'Shipment creation failed').slice(0, 500) } });
    throw error;
  }
});

const getShipment = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne(scoped(req, { _id: req.params.id })).populate('order', 'orderNumber user total orderStatus');
  if (!shipment) { res.status(404); throw new Error('Shipment not found'); }
  if (req.user.role === 'customer' && String(shipment.order.user) !== String(req.user._id)) { res.status(403); throw new Error('Not authorized'); }
  const events = await listShipmentEvents(shipment._id);
  res.json({ success: true, shipment: req.user.role === 'customer' ? publicShipment(shipment) : shipment, events: req.user.role === 'customer' ? events.map(publicEvent) : events });
});

const getShipmentEvents = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne(scoped(req, { _id: req.params.id })).select('_id order');
  if (!shipment) { res.status(404); throw new Error('Shipment not found'); }
  const order = await Order.findOne(scoped(req, { _id: shipment.order })).select('user');
  if (req.user.role === 'customer' && (!order || String(order.user) !== String(req.user._id))) { res.status(403); throw new Error('Not authorized'); }
  const events = await listShipmentEvents(shipment._id);
  res.json({ success: true, events: req.user.role === 'customer' ? events.map(publicEvent) : events });
});

const getOrderShipment = asyncHandler(async (req, res) => {
  const order = await Order.findOne(scoped(req, { _id: req.params.orderId })).select('_id user');
  if (!order) { res.status(404); throw new Error('Order not found'); }
  if (req.user.role === 'customer' && String(order.user) !== String(req.user._id)) { res.status(403); throw new Error('Not authorized'); }
  const shipment = await Shipment.findOne(scoped(req, { order: order._id })).sort({ updatedAt: -1 }).lean();
  if (!shipment) return res.json({ success: true, shipment: null, events: [] });
  const events = await listShipmentEvents(shipment._id);
  res.json({ success: true, shipment: publicShipment(shipment), events: events.map(publicEvent) });
});

const listShipments = asyncHandler(async (req, res) => {
  const filter = scoped(req, {});
  if (req.query.provider) filter.provider = String(req.query.provider).trim().toLowerCase();
  if (req.query.status && SHIPMENT_STATUSES.includes(String(req.query.status))) filter.status = String(req.query.status);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const shipments = await Shipment.find(filter).sort({ updatedAt: -1 }).limit(limit).populate('order', 'orderNumber total orderStatus createdAt').lean();
  res.json({ success: true, shipments });
});

const updateShipmentStatus = asyncHandler(async (req, res) => {
  const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 180) { res.status(400); throw new Error('A valid Idempotency-Key header is required'); }
  const requestedStatus = String(req.body?.status || '').trim().toLowerCase();
  if (!SHIPMENT_STATUSES.includes(requestedStatus)) { res.status(400); throw new Error('A canonical shipment status is required'); }
  const status = normalizeShipmentStatus(requestedStatus);
  const result = await recordShipmentEvent({
    shipmentId: req.params.id,
    tenant: req.tenant?._id,
    status,
    eventKey: `manual:${idempotencyKey}`,
    description: req.body?.note || `Shipment status updated to ${status}`,
    location: req.body?.location || '',
    source: 'manual',
    raw: { note: req.body?.note || '', location: req.body?.location || '' },
    trackingNumber: req.body?.trackingNumber,
    courierName: req.body?.courierName,
  });
  res.json({ success: true, shipment: result.shipment, event: result.event, order: result.order, idempotent: result.idempotent });
});

const syncShipment = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne(scoped(req, { _id: req.params.id }));
  if (!shipment) { res.status(404); throw new Error('Shipment not found'); }
  if (!shipment.trackingNumber) { res.status(409); throw new Error('Shipment does not have a tracking number yet'); }
  const tracking = await shippingProviderManager.trackShipment({ tenantId: req.tenant?._id, provider: shipment.provider, trackingNumber: shipment.trackingNumber });
  const result = await recordProviderTracking({ shipmentId: shipment._id, tenant: req.tenant?._id, result: tracking });
  res.json({ success: true, tracking, shipment: result.shipment, events: result.events, idempotent: result.idempotent });
});

module.exports = { createShipment, getShipment, getShipmentEvents, getOrderShipment, listShipments, updateShipmentStatus, syncShipment };
