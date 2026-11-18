const { registerAdapter } = require('./providerRegistry');
const razorpay = require('../payment/gateways/razorpay');
const shiprocket = require('../shipping/providers/shiprocket');
const delhivery = require('../shipping/providers/delhivery');
const xpressbees = require('../shipping/providers/xpressbees');
const bluedart = require('../shipping/providers/bluedart');
const cashfree = require('../payment/gateways/cashfree');
const stripe = require('../payment/gateways/stripe');
const wati = require('../notifications/providers/wati');
const trustsignal = require('../notifications/providers/trustsignal');
const fcm = require('../notifications/providers/fcm');
const marketing = require('../marketingProviders');
const r2 = require('../storage/r2Adapter');
const legacy = require('./legacyAdapters');
const turnstile = require('./cloudflareTurnstileAdapter');
const searchProviders = require('../search/searchProviders');
const credentialAdapters = require('./providerCredentialAdapters');

registerAdapter('razorpay', { ...razorpay, testConnection: razorpay.testConnection });
registerAdapter('shiprocket', { ...shiprocket, testConnection: shiprocket.testConnection });
registerAdapter('delhivery', delhivery);
registerAdapter('cashfree', cashfree);
registerAdapter('stripe', stripe);
registerAdapter('wati', wati);
registerAdapter('trustsignal', trustsignal);
registerAdapter('fcm', fcm);
registerAdapter('brevo', marketing.brevo);
registerAdapter('klaviyo', marketing.klaviyo);
registerAdapter('ga4', marketing.ga4);
registerAdapter('meta_capi', marketing.meta);
registerAdapter('r2', r2);
registerAdapter('googleauth', legacy.googleauth);
registerAdapter('msg91', legacy.msg91);
registerAdapter('cloudflare_turnstile', turnstile);
registerAdapter('algolia', searchProviders.algolia);
registerAdapter('opensearch', searchProviders.opensearch);

// These providers require tenant-specific onboarding, but their credential
// checks are fully server-side and live. Operational methods remain explicit
// until the provider account has the required production/sandbox permissions.
Object.entries(credentialAdapters).forEach(([provider, adapter]) => registerAdapter(provider, adapter));

// Operational shipping adapters are registered after the credential probes so
// the provider test still shares the same encrypted admin credentials while
// runtime rates/shipments use the real provider contract.
registerAdapter('delhivery', delhivery);
registerAdapter('xpressbees', xpressbees);
registerAdapter('bluedart', bluedart);

module.exports = true;
