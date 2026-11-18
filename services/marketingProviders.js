const crypto = require('crypto');
const httpRequest = require('../utils/httpRequest');

const assert = (condition, message) => { if (!condition) throw new Error(message); };

const brevo = {
  contractMethods: ['upsertProfile', 'trackEvent', 'sendEmail', 'testConnection'],
  async upsertProfile({ email, attributes = {} }, config) {
    assert(config.api_key && email, 'Brevo API key and email are required');
    const { data } = await httpRequest({ url: 'https://api.brevo.com/v3/contacts', method: 'POST', headers: { 'api-key': config.api_key }, body: { email, attributes, updateEnabled: true } });
    return { externalId: email, status: 'sent', raw: data };
  },
  async trackEvent({ email, event, properties = {}, eventId }, config) {
    assert(config.api_key && email && event, 'Brevo API key, email and event are required');
    const { data } = await httpRequest({ url: 'https://api.brevo.com/v3/events', method: 'POST', headers: { 'api-key': config.api_key }, body: { event_name: event, identifiers: { email_id: email }, event_properties: { ...properties, event_id: eventId || crypto.randomUUID() } } });
    return { externalId: eventId || '', status: 'sent', raw: data };
  },
  async sendEmail({ to, subject, html, sender }, config) {
    assert(config.api_key && to, 'Brevo API key and recipient are required');
    const { data } = await httpRequest({ url: 'https://api.brevo.com/v3/smtp/email', method: 'POST', headers: { 'api-key': config.api_key }, body: { sender: sender || { email: config.sender_email }, to: [{ email: to }], subject, htmlContent: html } });
    return { externalId: data?.messageId || '', status: 'sent', raw: data };
  },
  async testConnection(config) { assert(config.api_key, 'Brevo API key is required'); await httpRequest({ url: 'https://api.brevo.com/v3/account', headers: { 'api-key': config.api_key } }); return { success: true, message: 'Brevo connection is valid' }; },
};

const klaviyo = {
  contractMethods: ['upsertProfile', 'trackEvent', 'testConnection'],
  async upsertProfile({ email, properties = {} }, config) {
    assert(config.private_api_key && email, 'Klaviyo private API key and email are required');
    const { data } = await httpRequest({ url: 'https://a.klaviyo.com/api/profile-import/', method: 'POST', headers: { Authorization: `Klaviyo-API-Key ${config.private_api_key}`, revision: '2024-10-15' }, body: { data: { type: 'profile', attributes: { email, properties } } } });
    return { externalId: data?.data?.id || email, status: 'sent', raw: data };
  },
  async trackEvent({ email, event, properties = {}, eventId }, config) {
    assert(config.private_api_key && email && event, 'Klaviyo private API key, email and event are required');
    const { data } = await httpRequest({ url: 'https://a.klaviyo.com/api/events/', method: 'POST', headers: { Authorization: `Klaviyo-API-Key ${config.private_api_key}`, revision: '2024-10-15' }, body: { data: { type: 'event', attributes: { unique_id: eventId || crypto.randomUUID(), time: new Date().toISOString(), metric: { data: { type: 'metric', attributes: { name: event } } }, profile: { data: { type: 'profile', attributes: { email } } }, properties } } } });
    return { externalId: eventId || '', status: 'sent', raw: data };
  },
  async testConnection(config) { assert(config.private_api_key, 'Klaviyo private API key is required'); await httpRequest({ url: 'https://a.klaviyo.com/api/accounts/', headers: { Authorization: `Klaviyo-API-Key ${config.private_api_key}`, revision: '2024-10-15' } }); return { success: true, message: 'Klaviyo connection is valid' }; },
};

const ga4 = {
  contractMethods: ['trackEvent', 'testConnection'],
  async trackEvent({ clientId = crypto.randomUUID(), userId, events = [] }, config) {
    assert(config.measurement_id && config.api_secret, 'GA4 measurement ID and API secret are required');
    await httpRequest({ url: `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(config.measurement_id)}&api_secret=${encodeURIComponent(config.api_secret)}`, method: 'POST', body: { client_id: clientId, ...(userId ? { user_id: userId } : {}), events } });
    return { status: 'sent' };
  },
  async testConnection(config) { assert(config.measurement_id && config.api_secret, 'GA4 measurement ID and API secret are required'); return { success: true, message: 'GA4 Measurement Protocol configuration is valid' }; },
};

const meta = {
  contractMethods: ['trackEvent', 'testConnection'],
  async trackEvent({ eventName, eventTime, eventId, userData = {}, customData = {} }, config) {
    assert(config.pixel_id && config.access_token, 'Meta pixel ID and access token are required');
    const { data } = await httpRequest({ url: `https://graph.facebook.com/${config.api_version || 'v20.0'}/${encodeURIComponent(config.pixel_id)}/events?access_token=${encodeURIComponent(config.access_token)}`, method: 'POST', body: { data: [{ event_name: eventName, event_time: eventTime || Math.floor(Date.now() / 1000), event_id: eventId || crypto.randomUUID(), action_source: 'website', user_data: userData, custom_data: customData }] } });
    return { status: data?.events_received ? 'sent' : 'failed', raw: data };
  },
  async testConnection(config) { assert(config.pixel_id && config.access_token, 'Meta pixel ID and access token are required'); return { success: true, message: 'Meta Conversions API configuration is valid' }; },
};

module.exports = { brevo, klaviyo, ga4, meta };
