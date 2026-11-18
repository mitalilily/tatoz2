const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const CommunicationConsent = require('../models/CommunicationConsent');
const { isUserInTenant } = require('../services/customerScopeService');

const CHANNELS = ['email', 'push', 'sms', 'whatsapp'];
const USER_CHANNELS = ['email', 'push', 'sms'];
const PURPOSES = ['transactional', 'marketing'];

const preferenceError = (message, statusCode = 400, publicCode = 'NOTIFICATION_PREFERENCES_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const isBoolean = value => typeof value === 'boolean';

const defaultConsent = purpose => purpose === 'marketing' ? false : true;

const readPreferences = async ({ tenant, userId }) => {
  const [user, consents] = await Promise.all([
    User.findById(userId).select('email phone notificationPrefs').lean(),
    CommunicationConsent.find({ tenant, user: userId }).select('channel purpose optedIn source optedAt').lean(),
  ]);
  if (!user) throw preferenceError('User not found', 404, 'USER_NOT_FOUND');

  const consentMap = new Map(consents.map(item => [`${item.purpose}:${item.channel}`, item]));
  const channels = Object.fromEntries(USER_CHANNELS.map(channel => [channel, user.notificationPrefs?.[channel] !== false]));
  const purposes = Object.fromEntries(PURPOSES.map(purpose => [
    purpose,
    Object.fromEntries(CHANNELS.map(channel => {
      const item = consentMap.get(`${purpose}:${channel}`);
      return [channel, item ? Boolean(item.optedIn) : defaultConsent(purpose)];
    })),
  ]));

  return {
    channels,
    purposes,
    user: { email: user.email || '', phone: user.phone || '' },
    tenant: String(tenant),
  };
};

const requireTenant = req => {
  if (!req.tenant?._id) throw preferenceError('Tenant context is required', 400, 'TENANT_REQUIRED');
  return req.tenant._id;
};

const assertTenantUser = async req => {
  const tenant = requireTenant(req);
  if (!['admin', 'superadmin'].includes(req.user?.role) && !(await isUserInTenant({ tenant, userId: req.user._id }))) {
    throw preferenceError('Customer is not part of this store', 403, 'TENANT_MEMBERSHIP_REQUIRED');
  }
  return tenant;
};

const assertBooleanRecord = (record, allowed, label) => {
  if (record === undefined) return;
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw preferenceError(`${label} must be an object`);
  for (const [key, value] of Object.entries(record)) {
    if (!allowed.includes(key) || !isBoolean(value)) throw preferenceError(`Invalid ${label} value`);
  }
};

const getPreferences = asyncHandler(async (req, res) => {
  const tenant = await assertTenantUser(req);
  res.json({ success: true, preferences: await readPreferences({ tenant, userId: req.user._id }) });
});

const updatePreferences = asyncHandler(async (req, res) => {
  const tenant = await assertTenantUser(req);
  const { channels, purposes } = req.body || {};
  assertBooleanRecord(channels, USER_CHANNELS, 'channels');
  if (purposes !== undefined) {
    if (!purposes || typeof purposes !== 'object' || Array.isArray(purposes)) throw preferenceError('purposes must be an object');
    for (const [purpose, values] of Object.entries(purposes)) {
      if (!PURPOSES.includes(purpose)) throw preferenceError('Invalid notification purpose');
      assertBooleanRecord(values, CHANNELS, 'purpose channels');
    }
  }
  if (channels === undefined && purposes === undefined) throw preferenceError('At least one preference is required');

  const userUpdates = {};
  for (const channel of USER_CHANNELS) {
    if (channels && channel in channels) userUpdates[`notificationPrefs.${channel}`] = channels[channel];
  }
  if (Object.keys(userUpdates).length) {
    await User.updateOne({ _id: req.user._id }, { $set: userUpdates });
  }

  const consentWrites = [];
  for (const purpose of PURPOSES) {
    for (const channel of CHANNELS) {
      if (purposes?.[purpose] && channel in purposes[purpose]) {
        consentWrites.push({
          updateOne: {
            filter: { tenant, user: req.user._id, channel, purpose },
            update: { $set: { optedIn: purposes[purpose][channel], source: 'account_settings', optedAt: new Date() }, $setOnInsert: { tenant, user: req.user._id, channel, purpose } },
            upsert: true,
          },
        });
      }
    }
  }
  if (consentWrites.length) await CommunicationConsent.bulkWrite(consentWrites);

  res.json({ success: true, preferences: await readPreferences({ tenant, userId: req.user._id }) });
});

module.exports = { getPreferences, updatePreferences, readPreferences, CHANNELS, PURPOSES };
