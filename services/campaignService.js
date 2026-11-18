const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Notification = require('../models/Notification');
const CustomerSegmentMembership = require('../models/CustomerSegmentMembership');
const User = require('../models/User');
const DeviceToken = require('../models/DeviceToken');
const { getTenantCustomerIds } = require('./customerScopeService');
const notificationDeliveryService = require('./notificationDeliveryService');
const { withLock } = require('./distributedLock');

const CHANNELS = new Set(['in_app', 'email', 'whatsapp', 'push', 'sms']);
const OBJECTIVES = new Set(['promotional', 'product_launch', 'cart_recovery', 'win_back', 'coupon', 'referral', 'transactional']);
const idOf = value => value?._id || value;
const tenantIdOf = tenant => idOf(tenant);

const campaignError = (message, statusCode = 400, code = 'CAMPAIGN_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = code;
  return error;
};

const boundedText = (value, label, max, { required = false } = {}) => {
  const text = String(value ?? '').trim();
  if (required && !text) throw campaignError(`${label} is required`, 400, 'CAMPAIGN_REQUIRED_FIELD');
  if (text.length > max) throw campaignError(`${label} must be ${max} characters or fewer`, 400, 'CAMPAIGN_FIELD_TOO_LONG');
  return text;
};

const normalize = (body = {}) => {
  const name = boundedText(body.name, 'Campaign name', 160, { required: true });
  const title = boundedText(body.title, 'Notification title', 160, { required: true });
  const message = boundedText(body.message, 'Message', 4000, { required: true });
  const channels = Array.from(new Set((Array.isArray(body.channels) ? body.channels : ['in_app']).map(value => String(value).toLowerCase()).filter(value => CHANNELS.has(value))));
  if (!channels.length) throw campaignError('Select at least one supported campaign channel');
  const audience = body.audience && typeof body.audience === 'object' ? body.audience : {};
  const audienceType = ['all', 'segment', 'customers'].includes(audience.type) ? audience.type : 'all';
  if (audienceType === 'segment' && !mongoose.isValidObjectId(audience.segment)) throw campaignError('A valid customer segment is required');
  const rawUsers = Array.isArray(audience.users) ? audience.users : [];
  if (rawUsers.length > 5000) throw campaignError('A campaign can target at most 5000 customers', 400, 'CAMPAIGN_AUDIENCE_TOO_LARGE');
  const users = rawUsers.map(value => String(value).trim());
  if (users.some(value => !mongoose.isValidObjectId(value))) {
    throw campaignError('Every customer ID must be a valid MongoDB ObjectId', 400, 'CAMPAIGN_CUSTOMER_IDS_INVALID');
  }
  if (audienceType === 'customers' && !users.length) throw campaignError('Select at least one customer');
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw campaignError('Campaign schedule is invalid');
  return {
    name, title, message, channels,
    objective: OBJECTIVES.has(String(body.objective || '').toLowerCase()) ? String(body.objective).toLowerCase() : 'promotional',
    subject: boundedText(body.subject || title, 'Email subject', 200),
    html: boundedText(body.html, 'HTML content', 30000),
    templateName: boundedText(body.templateName, 'Template name', 160),
    couponCode: boundedText(body.couponCode, 'Coupon code', 80).toUpperCase(),
    audience: { type: audienceType, segment: audienceType === 'segment' ? audience.segment : undefined, users: audienceType === 'customers' ? users : [] },
    scheduledAt,
  };
};

const validateCustomerAudience = async ({ tenantId, data }) => {
  if (data.audience?.type !== 'customers') return;
  const allowedIds = new Set((await getTenantCustomerIds(tenantId) || []).map(value => String(value)));
  const outsideTenant = data.audience.users.filter(value => !allowedIds.has(String(value)));
  if (outsideTenant.length) {
    throw campaignError('One or more customer IDs are not available in this tenant', 404, 'CAMPAIGN_CUSTOMERS_OUTSIDE_TENANT');
  }
};

const list = async ({ tenant, status, page = 1, limit = 30 } = {}) => {
  const tenantId = tenantIdOf(tenant);
  if (!tenantId) throw campaignError('Tenant context is required', 400, 'TENANT_REQUIRED');
  const filter = { tenant: tenantId, ...(status ? { status } : {}) };
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const [campaigns, total] = await Promise.all([
    Campaign.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    Campaign.countDocuments(filter),
  ]);
  return { campaigns, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

const resolveUsers = async campaign => {
  const tenantId = campaign.tenant;
  let ids = [];
  if (campaign.audience?.type === 'segment') {
    ids = await CustomerSegmentMembership.distinct('user', { tenant: tenantId, segment: campaign.audience.segment });
  } else if (campaign.audience?.type === 'customers') {
    ids = campaign.audience.users || [];
  } else {
    ids = await getTenantCustomerIds(tenantId) || [];
  }
  if (!ids.length) return [];
  return User.find({ _id: { $in: ids }, role: 'customer', isActive: true }).select('_id name email phone notificationPrefs').lean();
};

const execute = async ({ tenant, campaignId, force = false } = {}) => {
  const tenantId = tenantIdOf(tenant);
  const now = new Date();
  const dueFilter = force
    ? { status: { $in: ['draft', 'scheduled', 'failed'] } }
    : { status: 'scheduled', scheduledAt: { $ne: null, $lte: now } };
  const campaign = await Campaign.findOneAndUpdate(
    { _id: campaignId, tenant: tenantId, ...dueFilter },
    { $set: { status: 'running', 'metrics.startedAt': now, lastError: '' } },
    { new: true },
  );
  if (!campaign) return { idempotent: true, message: 'Campaign is not due or is already running' };
  try {
    const users = await resolveUsers(campaign);
    const channels = campaign.channels || ['in_app'];
    let queued = 0;
    let sent = 0;
    let failed = 0;
    if (channels.includes('in_app') && users.length) {
      await Notification.create({
        tenant: tenantId,
        title: campaign.title,
        message: campaign.message,
        type: 'promo',
        target: campaign.audience?.type === 'all' ? 'all' : 'specific',
        ...(campaign.audience?.type === 'all' ? {} : { targetUsers: users.map(user => user._id) }),
        channels: { email: channels.includes('email'), push: channels.includes('push'), sms: channels.includes('sms') },
        data: { campaignId: campaign._id, objective: campaign.objective, couponCode: campaign.couponCode },
        sentAt: now,
        status: 'sent',
      });
      sent += users.length;
    }
    for (const user of users) {
      for (const channel of channels.filter(item => item !== 'in_app')) {
        const recipients = channel === 'push'
          ? (await DeviceToken.find({ tenant: tenantId, user: user._id, invalidatedAt: null }).select('token').lean()).map(item => item.token)
          : [channel === 'email' ? user.email : user.phone].filter(Boolean);
        for (const recipient of recipients) {
          try {
            await notificationDeliveryService.send({
              tenant: tenantId,
              channel,
              recipient,
              email: channel === 'email' ? user.email : undefined,
              userId: user._id,
              purpose: 'marketing',
              eventType: `campaign.${campaign._id}`,
              idempotencyKey: `campaign:${campaign._id}:${user._id}:${channel}:${recipient}`,
              templateName: campaign.templateName,
              title: campaign.title,
              body: campaign.message,
              subject: campaign.subject,
              html: campaign.html || `<p>${campaign.message.replace(/\n/g, '<br />')}</p>`,
              data: { campaignId: String(campaign._id), couponCode: campaign.couponCode },
            });
            queued += 1;
          } catch (_) { failed += 1; }
        }
      }
    }
    const updated = await Campaign.findOneAndUpdate(
      { _id: campaign._id, tenant: tenantId, status: 'running' },
      { $set: { status: 'completed', 'metrics.audience': users.length, 'metrics.queued': queued, 'metrics.sent': sent, 'metrics.failed': failed, 'metrics.completedAt': new Date() } },
      { new: true },
    ).lean();
    return { campaign: updated, idempotent: false };
  } catch (error) {
    await Campaign.updateOne({ _id: campaign._id, tenant: tenantId }, { $set: { status: 'failed', lastError: String(error.message || 'Campaign failed').slice(0, 500) } });
    throw error;
  }
};

const tick = async () => withLock('scheduler:campaigns', 5 * 60 * 1000, async () => {
  const due = await Campaign.find({ status: 'scheduled', scheduledAt: { $ne: null, $lte: new Date() } }).select('_id tenant').limit(20).lean();
  let processed = 0;
  for (const item of due) {
    const result = await execute({ tenant: item.tenant, campaignId: item._id });
    if (!result.idempotent) processed += 1;
  }
  return { scanned: due.length, processed };
});

const create = async ({ tenant, body, actorId }) => {
  const tenantId = tenantIdOf(tenant);
  const data = normalize(body);
  await validateCustomerAudience({ tenantId, data });
  const status = data.scheduledAt && data.scheduledAt > new Date() ? 'scheduled' : 'draft';
  return Campaign.create({ ...data, tenant: tenantId, status, createdBy: actorId });
};

const update = async ({ tenant, campaignId, body }) => {
  const campaign = await Campaign.findOne({ _id: campaignId, tenant: tenantIdOf(tenant) });
  if (!campaign) return null;
  if (['running', 'completed'].includes(campaign.status)) throw campaignError('Running or completed campaigns cannot be edited', 409, 'CAMPAIGN_IMMUTABLE');
  const data = normalize(body);
  await validateCustomerAudience({ tenantId: tenantIdOf(tenant), data });
  campaign.set(data);
  campaign.status = data.scheduledAt && data.scheduledAt > new Date() ? 'scheduled' : 'draft';
  return campaign.save();
};

module.exports = { create, update, list, execute, tick, resolveUsers, normalize };
