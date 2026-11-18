const crypto = require('crypto');
const Shipment = require('../../models/Shipment');
const ShipmentEvent = require('../../models/ShipmentEvent');
const Order = require('../../models/Order');
const { normalizeOrderStatus } = require('../../constants/orderStatuses');

const SHIPMENT_STATUSES = ['creating', 'created', 'pickup_scheduled', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'rto', 'cancelled', 'returned', 'failed'];
const STATUS_RANK = Object.freeze({ creating: 0, created: 1, pickup_scheduled: 2, in_transit: 3, out_for_delivery: 4, delivered: 5, failed_delivery: 4, rto: 5, cancelled: 5, returned: 6, failed: 0 });
const ORDER_RANK = Object.freeze({ pending: 0, confirmed: 1, processing: 2, packed: 3, ready_to_ship: 4, shipped: 5, out_for_delivery: 6, failed_delivery: 6, rto: 7, partially_fulfilled: 3, delivered: 7, return_requested: 8, refund_requested: 8, returned: 9, partially_refunded: 9, refunded: 10, cancelled: 11 });

const lifecycleError = (message, statusCode = 409, publicCode = 'SHIPMENT_TRANSITION_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const normalized = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const normalizeShipmentStatus = value => {
  const raw = normalized(value);
  if (!raw) return 'created';
  if (['delivered', 'delivery_completed', 'delivered_successfully'].includes(raw) || raw.includes('delivered')) return 'delivered';
  if (raw.includes('out_for_delivery') || raw === 'ofd' || raw.includes('outfordelivery')) return 'out_for_delivery';
  if (raw.includes('rto') || raw.includes('return_to_origin') || raw.includes('returned_to_sender')) return 'rto';
  if (raw.includes('failed') || raw.includes('ndr') || raw.includes('undelivered') || raw.includes('delivery_attempt')) return 'failed_delivery';
  if (raw.includes('cancel')) return 'cancelled';
  if (raw.includes('return')) return 'returned';
  if (raw.includes('pickup') || raw.includes('manifest') || raw.includes('ready_to_ship')) return 'pickup_scheduled';
  if (raw.includes('transit') || raw.includes('shipped') || raw.includes('dispatch') || raw.includes('picked_up')) return 'in_transit';
  if (['creating', 'created', 'new', 'pending', 'booked'].includes(raw)) return raw === 'creating' ? 'creating' : 'created';
  return 'created';
};

const assertShipmentTransition = (currentStatus, nextStatus) => {
  if (!SHIPMENT_STATUSES.includes(nextStatus)) throw lifecycleError('Invalid shipment status', 400, 'SHIPMENT_STATUS_INVALID');
  if (!currentStatus || currentStatus === nextStatus) return;
  if (['returned', 'cancelled'].includes(currentStatus)) throw lifecycleError(`Shipment is already ${currentStatus}`, 409, 'SHIPMENT_TERMINAL');
  if (nextStatus === 'cancelled' && ['delivered', 'returned'].includes(currentStatus)) throw lifecycleError('Delivered shipments cannot be cancelled', 409, 'SHIPMENT_TERMINAL');
  if (nextStatus === 'returned' && !['delivered', 'rto', 'failed_delivery'].includes(currentStatus)) throw lifecycleError('Shipment must be delivered or returned to origin before it can be returned', 409, 'SHIPMENT_TRANSITION_INVALID');
  if (nextStatus === 'rto' && !['failed_delivery', 'in_transit', 'out_for_delivery'].includes(currentStatus)) throw lifecycleError('RTO requires a failed or active delivery attempt', 409, 'SHIPMENT_TRANSITION_INVALID');
  if (nextStatus === 'failed_delivery' && !['in_transit', 'out_for_delivery', 'pickup_scheduled'].includes(currentStatus)) throw lifecycleError('Failed delivery requires an active shipment', 409, 'SHIPMENT_TRANSITION_INVALID');
  if (STATUS_RANK[nextStatus] < STATUS_RANK[currentStatus] && nextStatus !== 'failed_delivery') throw lifecycleError(`Shipment cannot move from ${currentStatus} to ${nextStatus}`, 409, 'SHIPMENT_TRANSITION_INVALID');
};

const eventKeyFor = ({ eventKey, providerEventId, status, eventAt, location, description }) => {
  if (eventKey) return String(eventKey).trim().slice(0, 180);
  if (providerEventId) return `provider:${String(providerEventId).trim().slice(0, 160)}`;
  const digest = crypto.createHash('sha256').update(JSON.stringify({ status, eventAt, location, description })).digest('hex').slice(0, 48);
  return `derived:${digest}`;
};

const eventDate = value => {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const orderStatusForShipment = status => ({ in_transit: 'shipped', out_for_delivery: 'out_for_delivery', delivered: 'delivered', failed_delivery: 'failed_delivery', rto: 'rto' }[status] || null);

const shouldApplyCurrentStatus = (currentStatus, nextStatus) => {
  if (!currentStatus || currentStatus === nextStatus) return true;
  if (['returned', 'cancelled'].includes(currentStatus)) return false;
  return (STATUS_RANK[nextStatus] ?? -1) >= (STATUS_RANK[currentStatus] ?? -1);
};

const applyOrderTracking = async ({ shipment, status, trackingNumber, courierName, eventAt }) => {
  const order = await Order.findOne({ _id: shipment.order, ...(shipment.tenant ? { tenant: shipment.tenant } : {}) });
  if (!order) return null;
  const update = {
    shippingStatus: status,
    shippingLastSync: new Date(),
    ...(trackingNumber ? { trackingNumber } : {}),
    ...(courierName ? { courierName } : {}),
  };
  const orderStatus = normalizeOrderStatus(orderStatusForShipment(status));
  const canAdvance = orderStatus && !['cancelled', 'returned', 'refunded'].includes(order.orderStatus) && (
    ORDER_RANK[orderStatus] > (ORDER_RANK[order.orderStatus] ?? -1)
    || (orderStatus === 'failed_delivery' && order.orderStatus === 'out_for_delivery')
  );
  if (canAdvance) {
    update.orderStatus = orderStatus;
    if (orderStatus === 'delivered') update.deliveredAt = order.deliveredAt || eventAt;
    await Order.updateOne({ _id: order._id, ...(shipment.tenant ? { tenant: shipment.tenant } : {}) }, { $set: update, $push: { statusHistory: { status: orderStatus, note: `Shipment status: ${status}`, updatedAt: eventAt } } });
  } else {
    await Order.updateOne({ _id: order._id, ...(shipment.tenant ? { tenant: shipment.tenant } : {}) }, { $set: update });
  }
  return Order.findById(order._id);
};

const recordShipmentEvent = async ({ shipmentId, tenant, status, eventKey, providerEventId, description = '', location = '', eventAt, source = 'system', raw = {}, trackingNumber, courierName, allowHistorical = false }) => {
  const shipment = await Shipment.findOne({ _id: shipmentId, ...(tenant ? { tenant } : {}) });
  if (!shipment) throw lifecycleError('Shipment not found', 404, 'SHIPMENT_NOT_FOUND');
  const normalizedStatus = normalizeShipmentStatus(status);
  const key = eventKeyFor({ eventKey, providerEventId, status: normalizedStatus, eventAt, location, description });
  const existing = await ShipmentEvent.findOne({ shipment: shipment._id, eventKey: key });
  if (existing) return { shipment, event: existing, order: null, idempotent: true };
  if (!allowHistorical) assertShipmentTransition(shipment.status, normalizedStatus);
  const applyCurrent = shouldApplyCurrentStatus(shipment.status, normalizedStatus);
  const occurredAt = eventDate(eventAt);
  let event;
  try {
    event = await ShipmentEvent.create({ tenant: shipment.tenant, shipment: shipment._id, order: shipment.order, provider: shipment.provider, eventKey: key, providerEventId, status: normalizedStatus, description: String(description || '').trim().slice(0, 500), location: String(location || '').trim().slice(0, 180), eventAt: occurredAt, source, raw });
  } catch (error) {
    if (error?.code === 11000) return { shipment, event: await ShipmentEvent.findOne({ shipment: shipment._id, eventKey: key }), order: null, idempotent: true };
    throw error;
  }
  if (!applyCurrent) {
    const current = await Shipment.findById(shipment._id);
    if (source === 'provider' || source === 'webhook') {
      await Shipment.updateOne({ _id: shipment._id }, { $set: { lastSyncedAt: new Date() } });
    }
    return { shipment: current, event, order: null, idempotent: false, historical: true };
  }
  const updated = await Shipment.findByIdAndUpdate(shipment._id, { $set: { status: normalizedStatus, lastEventAt: occurredAt, ...(source === 'provider' || source === 'webhook' ? { lastSyncedAt: new Date() } : {}), ...(trackingNumber ? { trackingNumber } : {}), ...(courierName ? { courierName } : {}) } }, { new: true });
  const order = await applyOrderTracking({ shipment: updated, status: normalizedStatus, trackingNumber, courierName, eventAt: occurredAt });
  return { shipment: updated, event, order, idempotent: false, historical: false };
};

const normalizeHistory = result => {
  const rows = Array.isArray(result?.history) ? result.history : [];
  return rows.map((row, index) => ({
    status: row.status || row.Status || row.activity || row.Activity || row.Scan || row.scan || result.status,
    description: row.description || row.activity || row.Activity || row.Scan || row.scan || row.status || row.Status || '',
    location: row.location || row.Location || row.ScannedLocation || row.scanned_location || '',
    eventAt: row.eventAt || row.date || row.Date || row.ScanDateTime || row.scanDateTime || row.updatedAt,
    providerEventId: row.eventId || row.id || row.status_id || undefined,
    raw: row,
  }));
};

const recordProviderTracking = async ({ shipmentId, tenant, result }) => {
  const shipment = await Shipment.findOne({ _id: shipmentId, ...(tenant ? { tenant } : {}) });
  if (!shipment) throw lifecycleError('Shipment not found', 404, 'SHIPMENT_NOT_FOUND');
  const history = normalizeHistory(result);
  const current = result?.status || result?.currentStatus;
  const events = [...history];
  const currentStatus = current ? normalizeShipmentStatus(current) : '';
  const trackingNumber = result?.awb || result?.awbCode || result?.waybill || shipment.trackingNumber || '';
  if (current && !events.some(event => normalizeShipmentStatus(event.status) === currentStatus)) {
    const latestHistoryAt = events.reduce((latest, event) => Math.max(latest, eventDate(event.eventAt).getTime()), 0);
    const providerCurrentAt = eventDate(result.eventAt || result.updatedAt).getTime();
    const currentEventAt = new Date(Math.max(Date.now(), latestHistoryAt + 1, providerCurrentAt || 0));
    events.push({
      status: current,
      eventKey: `current:${trackingNumber}:${currentStatus}`,
      description: current,
      location: result.location || '',
      eventAt: currentEventAt,
      raw: result,
    });
  }
  events.sort((a, b) => eventDate(a.eventAt) - eventDate(b.eventAt));
  let latest = { shipment, event: null, order: null, idempotent: true };
  for (const event of events) {
    latest = await recordShipmentEvent({ shipmentId, tenant, ...event, source: 'provider', trackingNumber, courierName: result.courierName, allowHistorical: true });
  }
  const updated = await Shipment.findOneAndUpdate({ _id: shipmentId, ...(tenant ? { tenant } : {}) }, { $set: { tracking: result, lastSyncedAt: new Date(), ...(trackingNumber ? { trackingNumber } : {}) } }, { new: true });
  return { shipment: updated, events: await ShipmentEvent.find({ shipment: shipmentId }).sort({ eventAt: -1, createdAt: -1 }).lean(), idempotent: latest.idempotent };
};

module.exports = { SHIPMENT_STATUSES, normalizeShipmentStatus, assertShipmentTransition, eventKeyFor, recordShipmentEvent, recordProviderTracking, normalizeHistory };
