const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');
const UserNotification = require('../models/UserNotification');
const IntegrationConnection = require('../models/IntegrationConnection');
const IntegrationDelivery = require('../models/IntegrationDelivery');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const notificationDeliveryService = require('../services/notificationDeliveryService');
const wati = require('../services/notifications/providers/wati');
const { isUserInTenant } = require('../services/customerScopeService');

const tenantScope = req => (req.tenant ? { tenant: req.tenant._id } : { tenant: null });
const visibleNotificationQuery = req => ({
  ...tenantScope(req),
  status: 'sent',
  $or: [
    { target: 'all' },
    { target: 'specific', targetUsers: req.user._id },
    { target: 'role', targetRole: { $in: req.user.role === 'superadmin' ? ['superadmin', 'admin'] : [req.user.role] } },
  ],
});

const canReadTenantNotifications = async req => {
  if (!req.tenant || ['admin', 'superadmin'].includes(req.user?.role)) return true;
  return isUserInTenant({ tenant: req.tenant._id, userId: req.user._id });
};

const sendNotification = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const { channel, recipient, userId, purpose, eventType, idempotencyKey, templateName, parameters, title, body, data, email, subject, html } = req.body || {};
  const delivery = await notificationDeliveryService.send({ tenant: req.tenant._id, channel, recipient, userId, purpose, eventType, idempotencyKey, templateName, parameters, title, body, data, email, subject, html });
  res.status(202).json({ success: true, deliveryId: delivery._id, status: delivery.status });
});

const handleWatiWebhook = asyncHandler(async (req, res) => {
  if (req.params.provider && String(req.params.provider).toLowerCase() !== 'wati') { res.status(404); throw new Error('Notification provider webhook is not supported'); }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch { return res.status(400).json({ success: false, message: 'Invalid webhook payload' }); }
  const signature = req.headers['x-wati-signature'] || req.headers['x-webhook-signature'] || '';
  const connections = await IntegrationConnection.find({ provider: 'wati', enabled: true }).select('+credentialsEncrypted tenant settings credentialHints').lean();
  let matched = null;
  for (const connection of connections) {
    try {
      const config = { ...require('../services/integrationService').decrypt(connection.credentialsEncrypted), ...connection.settings };
      const incomingChannel = payload.channel || payload.channel_number || payload.channelName;
      const channelMatches = incomingChannel && config.channel_number && String(incomingChannel) === String(config.channel_number);
      if (incomingChannel && config.channel_number && !channelMatches) continue;
      // A connection without a webhook secret may only be resolved by its
      // configured channel identifier; never accept an unauthenticated body
      // for an arbitrary tenant.
      if (!config.webhook_secret && !channelMatches) continue;
      wati.verifyWebhook(rawBody, signature, config);
      matched = connection;
      break;
    } catch (_) { /* try the next tenant connection */ }
  }
  if (!matched) return res.status(401).json({ success: false, message: 'Unable to verify WATI webhook' });
  const eventId = req.headers['x-wati-event-id'] || payload.id || payload.eventId || require('crypto').createHash('sha256').update(rawBody).digest('hex');
  const eventName = String(payload.eventType || payload.event || payload.status || 'delivery').toLowerCase();
  const deliveryStatus = eventName.includes('fail') || eventName.includes('error') ? 'failed' : eventName.includes('deliver') ? 'delivered' : 'sent';
  await IntegrationDelivery.findOneAndUpdate(
    { tenant: matched.tenant, provider: 'wati', idempotencyKey: `webhook:${eventId}` },
    { $setOnInsert: { tenant: matched.tenant, provider: 'wati', connection: matched._id, kind: 'webhook', eventType: eventName, idempotencyKey: `webhook:${eventId}`, status: deliveryStatus, response: payload, ...(deliveryStatus === 'delivered' ? { deliveredAt: new Date() } : {}) } },
    { upsert: true, new: true },
  );
  res.json({ success: true, received: true });
});

// TrustSignal delivery callbacks are matched only to an existing delivery
// created by this application. Unknown callbacks never create a tenant-owned
// record, which prevents an unauthenticated webhook from selecting a tenant.
const handleTrustsignalWebhook = asyncHandler(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch { return res.status(400).json({ success: false, message: 'Invalid webhook payload' }); }
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const externalId = data.transaction_id || data.transactionId || data.message_id || data.messageId || data.id;
  if (!externalId) return res.status(400).json({ success: false, message: 'TrustSignal delivery ID is required' });
  const statusValue = String(data.delivery_status || data.message_status || data.status || data.event || '').toLowerCase();
  const status = /fail|reject|undeliver|error/.test(statusValue) ? 'failed' : /deliver|success/.test(statusValue) ? 'delivered' : 'sent';
  const update = { status, response: payload, ...(status === 'delivered' ? { deliveredAt: new Date() } : {}) };
  const delivery = await IntegrationDelivery.findOneAndUpdate(
    { provider: 'trustsignal', externalId: String(externalId) },
    { $set: update },
    { new: true },
  ).select('_id tenant status');
  res.json({ success: true, received: true, matched: Boolean(delivery), status: delivery?.status || status });
});

const getNotificationDeliveries = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const provider = req.query.provider ? String(req.query.provider).toLowerCase() : undefined;
  res.json({ success: true, deliveries: await tenantIntegrationService.deliveries(req.tenant, provider) });
});

const getMyNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  if (!(await canReadTenantNotifications(req))) {
    return res.json({ success: true, notifications: [], unreadCount: 0, pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 0 } });
  }
  const notifQuery = visibleNotificationQuery(req);
  const notifications = await Notification.find(notifQuery).sort({ createdAt: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).lean();
  const total = await Notification.countDocuments(notifQuery);
  const readRecords = await UserNotification.find({ user: req.user._id, notification: { $in: notifications.map(item => item._id) } }).lean();
  const readMap = Object.fromEntries(readRecords.map(item => [String(item.notification), item]));
  let items = notifications.map(item => ({ ...item, isRead: Boolean(readMap[String(item._id)]?.isRead), readAt: readMap[String(item._id)]?.readAt || null, dismissed: Boolean(readMap[String(item._id)]?.dismissed) }));
  if (unreadOnly === 'true') items = items.filter(item => !item.isRead);
  const allIds = (await Notification.find(notifQuery).select('_id').lean()).map(item => item._id);
  const readCount = await UserNotification.countDocuments({ user: req.user._id, notification: { $in: allIds }, isRead: true });
  res.json({ success: true, notifications: items, unreadCount: allIds.length - readCount, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

const markAsRead = asyncHandler(async (req, res) => {
  if (!(await canReadTenantNotifications(req))) { res.status(404); throw new Error('Notification not found'); }
  const notification = await Notification.findOne({ ...visibleNotificationQuery(req), _id: req.params.id }).select('_id').lean();
  if (!notification) { res.status(404); throw new Error('Notification not found'); }
  await UserNotification.findOneAndUpdate({ user: req.user._id, notification: req.params.id }, { $set: { isRead: true, readAt: new Date() } }, { upsert: true });
  res.json({ success: true });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  if (!(await canReadTenantNotifications(req))) return res.json({ success: true });
  const query = visibleNotificationQuery(req);
  const notifications = await Notification.find(query).select('_id').lean();
  await UserNotification.bulkWrite(notifications.map(item => ({ updateOne: { filter: { user: req.user._id, notification: item._id }, update: { $set: { isRead: true, readAt: new Date() } }, upsert: true } })));
  res.json({ success: true });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  if (!(await canReadTenantNotifications(req))) return res.json({ success: true, unreadCount: 0 });
  const query = visibleNotificationQuery(req);
  const ids = (await Notification.find(query).select('_id').lean()).map(item => item._id);
  const readCount = await UserNotification.countDocuments({ user: req.user._id, notification: { $in: ids }, isRead: true });
  res.json({ success: true, unreadCount: ids.length - readCount });
});

module.exports = { sendNotification, handleWatiWebhook, handleTrustsignalWebhook, getNotificationDeliveries, getMyNotifications, markAsRead, markAllAsRead, getUnreadCount };
