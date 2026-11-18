const crypto = require('crypto');
const IntegrationDelivery = require('../models/IntegrationDelivery');
const CommunicationConsent = require('../models/CommunicationConsent');
const User = require('../models/User');
const DeviceToken = require('../models/DeviceToken');
const tenantIntegrationService = require('./tenantIntegrationService');
const { getAdapter } = require('./integrations/providerRegistry');
const { enqueue } = require('./outboxService');
const msg91Service = require('./msg91Service');

const channelProvider = { whatsapp: 'wati', push: 'fcm', email: 'brevo', sms: 'msg91' };

const resolveSmsProvider = async tenant => {
  try {
    const trustsignalService = require('./trustsignalService');
    const config = await trustsignalService.getConfig(tenant);
    if (trustsignalService.isConfigured(config)) return { id: 'trustsignal', config };
  } catch (_) { /* fall through to the configured MSG91 path */ }
  return { id: channelProvider.sms, config: null };
};

const isChannelAllowed = async ({ tenant, userId, channel, purpose = 'transactional' }) => {
  if (!userId) return true;
  const consent = await CommunicationConsent.findOne({ tenant, user: userId, channel, purpose }).lean();
  if (consent && !consent.optedIn) return false;
  if (purpose === 'marketing' && !consent?.optedIn) return false;
  const user = await User.findById(userId).select('notificationPrefs').lean();
  const preferenceKey = channel === 'whatsapp' ? null : channel;
  return !(preferenceKey && user?.notificationPrefs && user.notificationPrefs[preferenceKey] === false);
};

const send = async ({ tenant, channel, recipient, userId, purpose = 'transactional', eventType, idempotencyKey, templateName, parameters, title, body, data, email, subject, html }) => {
  if (!tenant) throw new Error('Tenant is required for notifications');
  const selected = channel === 'sms' ? await resolveSmsProvider(tenant) : { id: channelProvider[channel], config: null };
  const provider = selected.id;
  if (!provider) throw new Error(`Unsupported notification channel: ${channel}`);
  if (userId) {
    const allowed = await isChannelAllowed({ tenant, userId, channel, purpose });
    if (!allowed) throw new Error(`Recipient has disabled or not consented to ${channel} ${purpose} messages`);
    if (channel === 'push' && recipient) await DeviceToken.findOneAndUpdate({ tenant, token: recipient }, { $set: { user: userId, lastSeenAt: new Date(), invalidatedAt: null } }, { upsert: true, new: true });
  }
  const key = idempotencyKey || crypto.createHash('sha256').update(`${tenant}:${provider}:${eventType}:${recipient || email}`).digest('hex');
  const delivery = await IntegrationDelivery.findOneAndUpdate(
    { tenant, provider, idempotencyKey: key },
    { $setOnInsert: { tenant, provider, kind: 'notification', eventType, idempotencyKey: key, status: 'queued', payloadHash: crypto.createHash('sha256').update(JSON.stringify({ channel, recipient, templateName, parameters, title, body, email, subject })).digest('hex') } },
    { upsert: true, new: true },
  );
  if (delivery.status === 'sent' || delivery.status === 'delivered') return delivery;
  await enqueue({ tenant, type: `notification.${channel}`, aggregateType: 'IntegrationDelivery', aggregateId: delivery._id, idempotencyKey: `notification:${delivery._id}`, payload: { deliveryId: String(delivery._id), channel, provider, recipient, userId, templateName, parameters, title, body, data, email, subject, html } });
  return delivery;
};

const process = async ({ deliveryId, tenant, channel, provider: requestedProvider, recipient, userId, templateName, parameters, title, body, data, email, subject, html }) => {
  const provider = requestedProvider || channelProvider[channel];
  const delivery = await IntegrationDelivery.findOneAndUpdate({ _id: deliveryId, tenant, status: { $in: ['queued', 'failed', 'published'] } }, { $set: { status: 'processing' }, $inc: { attempts: 1 } }, { new: true });
  if (!delivery) return null;
  try {
    const config = provider === 'trustsignal'
      ? await require('./trustsignalService').getConfig(tenant)
      : await tenantIntegrationService.configFor(tenant, provider, { allowPlatformFallback: true });
    if (!config.enabled) throw new Error(`${provider} is not configured for this tenant`);
    const adapter = getAdapter(provider);
    if (!adapter) throw new Error(`${provider} adapter is not activated`);
    let result;
    if (provider === 'wati') result = await adapter.sendTemplateMessage({ phone: recipient, templateName, parameters }, config);
    // Campaign templateName belongs to WATI's named-template contract. MSG91
    // Flow campaigns must use the separately approved tenant SMS template
    // configured on the MSG91 integration, so a WhatsApp template name can
    // never accidentally be sent as an SMS Flow ID.
    else if (provider === 'msg91') result = await msg91Service.sendSMS(recipient, { tenantId: tenant, parameters, message: body });
    else if (provider === 'trustsignal') result = await adapter.sendSms({ phone: recipient, message: body, templateId: templateName, options: parameters }, config);
    else if (provider === 'fcm') result = await adapter.send({ token: recipient, title, body, data }, config);
    else result = await adapter.sendEmail({ to: email || recipient, subject, html, sender: config.sender_email ? { email: config.sender_email } : undefined }, config);
    await IntegrationDelivery.updateOne({ _id: delivery._id }, { $set: { status: result.status === 'failed' ? 'failed' : 'sent', externalId: result.externalId || '', response: result.raw || {}, sentAt: new Date(), error: result.status === 'failed' ? 'Provider rejected delivery' : '' } });
    return result;
  } catch (error) {
    if (provider === 'fcm' && userId && /unregistered|registration-token|not.?found|invalid/i.test(String(error.message || ''))) await DeviceToken.updateOne({ tenant, user: userId, token: recipient }, { $set: { invalidatedAt: new Date() } }).catch(() => {});
    await IntegrationDelivery.updateOne({ _id: delivery._id }, { $set: { status: delivery.attempts >= 5 ? 'dead_letter' : 'failed', error: String(error.message || 'Delivery failed').slice(0, 500), nextAttemptAt: new Date(Date.now() + Math.min(3600000, (2 ** delivery.attempts) * 1000)) } });
    throw error;
  }
};

module.exports = { send, process, channelProvider, isChannelAllowed };
