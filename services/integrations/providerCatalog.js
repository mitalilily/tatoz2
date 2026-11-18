// Provider metadata is deliberately separate from credentials and runtime
// adapters. It lets the tenant UI expose a complete roadmap without making a
// provider look connected before its adapter and sandbox checks are enabled.
const field = (key, label, type = 'text', options = {}) => ({ key, label, type, ...options });

const catalog = [
  {
    id: 'razorpay', name: 'Razorpay', category: 'payments', lifecycle: 'active',
    capabilities: ['create_order', 'verify_payment', 'refund', 'webhook'],
    fields: [field('key_id', 'Key ID', 'text', { required: true }), field('key_secret', 'Key secret', 'password', { required: true }), field('webhook_secret', 'Webhook secret', 'password')],
  },
  { id: 'googleauth', name: 'Google Authentication', category: 'authentication', lifecycle: 'active', capabilities: ['oauth'], fields: [field('client_id', 'OAuth client ID', 'text', { required: true }), field('client_secret', 'Client secret', 'password')] },
  { id: 'msg91', name: 'MSG91', category: 'notifications', lifecycle: 'active', capabilities: ['otp', 'sms'], fields: [field('auth_key', 'Auth key', 'password', { required: true }), field('template_id', 'OTP template ID', 'text', { required: true }), field('sms_template_id', 'SMS Flow template ID', 'text', { placeholder: 'Approved MSG91 Flow template for campaigns' })] },
  {
    id: 'trustsignal', name: 'TrustSignal SMS', category: 'notifications', lifecycle: 'active',
    capabilities: ['otp', 'sms', 'delivery_webhook', 'template_sync'],
    fields: [
      field('api_key', 'API key', 'password', { required: true }),
      field('sender_id', 'Sender ID', 'text', { required: true, defaultValue: 'TATOZS' }),
      field('base_url', 'API base URL', 'url', { defaultValue: 'https://api.trustsignal.io' }),
      field('route', 'SMS route', 'text', { defaultValue: 'transactional' }),
      field('dlt_entity_id', 'DLT entity ID', 'text'),
      field('otify_base_url', 'Otify base URL', 'url'),
      field('otify_template_id', 'Otify template ID', 'text'),
      field('login_otp_template_id', 'Login OTP template ID', 'text'),
      field('account_create_otp_template_id', 'Account creation OTP template ID', 'text'),
      field('forgot_password_otp_template_id', 'Forgot password OTP template ID', 'text'),
      field('welcome_template_id', 'Welcome SMS template ID', 'text'),
      field('order_confirmation_template_id', 'Order confirmation template ID', 'text'),
      field('shipping_confirmation_template_id', 'Shipping confirmation template ID', 'text'),
      field('delivery_confirmation_template_id', 'Delivery confirmation template ID', 'text'),
      field('seller_order_template_id', 'Seller order template ID', 'text'),
      field('webhook_url', 'Delivery webhook URL', 'url'),
    ],
  },
  {
    id: 'cashfree', name: 'Cashfree', category: 'payments', lifecycle: 'active',
    capabilities: ['create_order', 'status_lookup', 'refund', 'webhook'],
    fields: [field('app_id', 'App ID', 'text', { required: true }), field('app_secret', 'App secret', 'password', { required: true }), field('api_version', 'API version', 'text', { defaultValue: '2025-01-01' }), field('environment', 'Environment', 'select', { defaultValue: 'sandbox' }), field('webhook_secret', 'Webhook secret', 'password')],
  },
  {
    id: 'stripe', name: 'Stripe', category: 'payments', lifecycle: 'active',
    capabilities: ['payment_intent', 'status_lookup', 'refund', 'webhook'],
    fields: [field('secret_key', 'Secret key', 'password', { required: true }), field('publishable_key', 'Publishable key', 'text', { required: true }), field('webhook_secret', 'Webhook secret', 'password'), field('account_id', 'Connected account ID', 'text')],
  },
  {
    id: 'r2', name: 'Cloudflare R2', category: 'storage', lifecycle: 'active',
    capabilities: ['signed_upload', 'signed_download', 'delete', 'image_variants'],
    fields: [field('endpoint', 'S3 endpoint', 'url', { required: true }), field('bucket', 'Bucket', 'text', { required: true }), field('region', 'Region', 'text', { defaultValue: 'auto' }), field('access_key_id', 'Access key ID', 'text', { required: true }), field('secret_access_key', 'Secret access key', 'password', { required: true }), field('public_url', 'Public CDN URL', 'url')],
  },
  {
    id: 'cloudflare_turnstile', name: 'Cloudflare Turnstile', category: 'security', lifecycle: 'active',
    capabilities: ['bot_protection'],
    fields: [field('site_key', 'Site key', 'text', { required: true }), field('secret_key', 'Secret key', 'password', { required: true })],
  },
  {
    id: 'shiprocket', name: 'Shiprocket', category: 'shipping', lifecycle: 'active',
    capabilities: ['rates', 'serviceability', 'shipment', 'tracking', 'cancellation', 'returns'],
    fields: [field('email', 'Account email', 'email', { required: true }), field('password', 'Account password', 'password', { required: true }), field('pickup_location', 'Pickup location', 'text', { defaultValue: 'Primary' }), field('webhook_secret', 'Webhook secret', 'password')],
  },
  {
    id: 'delhivery', name: 'Delhivery', category: 'shipping', lifecycle: 'active',
    capabilities: ['rates', 'serviceability', 'shipment', 'tracking', 'cancellation', 'returns'],
    fields: [field('api_key', 'API token', 'password', { required: true }), field('test_pincode', 'Test pincode', 'text', { defaultValue: '110001' }), field('client_name', 'Delhivery client name', 'text', { required: true }), field('pickup_location', 'Warehouse / pickup location', 'text', { required: true }), field('pickup_pincode', 'Pickup pincode', 'text', { required: true }), field('seller_gst_tin', 'Seller GSTIN', 'text', { required: true }), field('hsn_code', 'HSN code', 'text', { required: true }), field('seller_name', 'Seller name', 'text'), field('seller_address', 'Seller address', 'text'), field('webhook_secret', 'Webhook secret', 'password')],
  },
  {
    id: 'xpressbees', name: 'XpressBees', category: 'shipping', lifecycle: 'active',
    capabilities: ['rates', 'serviceability', 'shipment', 'tracking', 'cancellation', 'returns'],
    fields: [field('email', 'Account email', 'email', { required: true }), field('password', 'Account password', 'password', { required: true }), field('base_url', 'API base URL', 'url', { defaultValue: 'https://shipment.xpressbees.com' }), field('pickup_warehouse', 'Pickup warehouse', 'text', { required: true }), field('pickup_pincode', 'Pickup pincode', 'text', { required: true }), field('pickup_address', 'Pickup address', 'text', { required: true }), field('pickup_contact_name', 'Pickup contact name', 'text'), field('pickup_phone', 'Pickup phone', 'text'), field('webhook_secret', 'Webhook secret', 'password')],
  },
  {
    id: 'bluedart', name: 'Blue Dart', category: 'shipping', lifecycle: 'contract',
    capabilities: ['rates', 'serviceability', 'shipment', 'tracking', 'cancellation', 'returns'],
    fields: [field('api_key', 'License / API key', 'password', { required: true }), field('login_id', 'Login ID', 'text', { required: true }), field('jwt_token', 'JWT token', 'password', { required: true }), field('test_awb', 'Test AWB', 'text', { required: true }), field('tracking_base_url', 'Tracking API base URL', 'url', { defaultValue: 'https://apigateway.bluedart.com/in/transportation/tracking/v1' }), field('webhook_secret', 'Webhook secret', 'password')],
  },
  {
    id: 'dtdc', name: 'DTDC', category: 'shipping', lifecycle: 'contract',
    capabilities: ['rates', 'serviceability', 'shipment', 'tracking', 'cancellation', 'returns'],
    fields: [field('api_key', 'API key', 'password', { required: true }), field('username', 'API username', 'text'), field('password', 'API password', 'password'), field('test_url', 'API verification URL', 'url', { required: true, placeholder: 'Provider account verification endpoint' }), field('webhook_secret', 'Webhook secret', 'password')],
  },
  {
    id: 'wati', name: 'WATI WhatsApp', category: 'notifications', lifecycle: 'active',
    capabilities: ['template_message', 'otp', 'delivery_webhook', 'template_sync', 'opt_out'],
    fields: [field('api_endpoint', 'API endpoint', 'url', { required: true }), field('api_token', 'API token', 'password', { required: true }), field('channel_number', 'Channel number', 'text'), field('otp_template_name', 'OTP template name', 'text', { defaultValue: 'otp' }), field('webhook_secret', 'Webhook secret', 'password')],
  },
  { id: 'smtp', name: 'SMTP email', category: 'notifications', lifecycle: 'active', capabilities: ['transactional_email'], fields: [field('host', 'SMTP host', 'text', { required: true }), field('port', 'Port', 'number', { defaultValue: 587 }), field('user', 'Username', 'text', { required: true }), field('pass', 'Password', 'password', { required: true }), field('from', 'From', 'email', { required: true })] },
  { id: 'fcm', name: 'Firebase Cloud Messaging', category: 'notifications', lifecycle: 'active', capabilities: ['push', 'topic_push'], fields: [field('project_id', 'Project ID', 'text', { required: true }), field('client_email', 'Service account email', 'email', { required: true }), field('private_key', 'Private key', 'password', { required: true })] },
  { id: 'brevo', name: 'Brevo', category: 'marketing', lifecycle: 'active', capabilities: ['profile_upsert', 'event_tracking', 'transactional_email'], fields: [field('api_key', 'API key', 'password', { required: true }), field('sender_email', 'Sender email', 'email')] },
  { id: 'klaviyo', name: 'Klaviyo', category: 'marketing', lifecycle: 'active', capabilities: ['profile_upsert', 'event_tracking', 'catalogue_sync', 'unsubscribe'], fields: [field('private_api_key', 'Private API key', 'password', { required: true }), field('public_api_key', 'Public API key', 'text')] },
  { id: 'ga4', name: 'Google Analytics 4', category: 'marketing', lifecycle: 'active', capabilities: ['server_side_events'], fields: [field('measurement_id', 'Measurement ID', 'text', { required: true }), field('api_secret', 'API secret', 'password', { required: true })] },
  { id: 'meta_capi', name: 'Meta Conversions API', category: 'marketing', lifecycle: 'active', capabilities: ['server_side_events'], fields: [field('pixel_id', 'Pixel ID', 'text', { required: true }), field('access_token', 'Access token', 'password', { required: true })] },
  { id: 'algolia', name: 'Algolia', category: 'search', lifecycle: 'active', capabilities: ['search', 'autocomplete', 'facets', 'reindex'], fields: [field('app_id', 'Application ID', 'text', { required: true }), field('admin_api_key', 'Admin API key', 'password', { required: true }), field('index_name', 'Index name', 'text', { required: true })] },
  { id: 'opensearch', name: 'OpenSearch', category: 'search', lifecycle: 'contract', capabilities: ['search', 'autocomplete', 'facets', 'reindex'], fields: [field('endpoint', 'Endpoint', 'url', { required: true }), field('username', 'Username', 'text'), field('password', 'Password', 'password'), field('index_name', 'Index name', 'text', { required: true })] },
  { id: 'cleartax', name: 'ClearTax', category: 'compliance', lifecycle: 'contract', capabilities: ['gst_invoice', 'e_invoice', 'eway_bill'], fields: [field('api_key', 'Access token', 'password', { required: true }), field('base_url', 'API base URL', 'url', { defaultValue: 'https://api.clear.in' }), field('gstin', 'GSTIN', 'text', { required: true })] },
  { id: 'iris_gst', name: 'IRIS GST', category: 'compliance', lifecycle: 'contract', capabilities: ['gst_invoice', 'e_invoice', 'eway_bill'], fields: [field('client_id', 'Client ID', 'text', { required: true }), field('client_secret', 'Client secret', 'password', { required: true }), field('gstin', 'GSTIN', 'text', { required: true }), field('base_url', 'API base URL', 'url', { defaultValue: 'https://einvoice6.gsp.irisgst.com' }), field('auth_url', 'Authentication URL', 'url')] },
  ...['ondc', 'meesho', 'myntra', 'jiomart'].map(id => ({
    id, name: id === 'jiomart' ? 'JioMart' : id.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()), category: 'marketplace', lifecycle: 'contract',
    capabilities: ['sync'], fields: [field('api_key', 'API key', 'password', { required: true }), field('base_url', 'API base URL', 'url', { required: true }), field('test_path', 'Verification path', 'text', { defaultValue: '/health' }), field('account_id', 'Account ID', 'text')],
  })),
  {
    id: 'unicommerce', name: 'Unicommerce', category: 'operations', lifecycle: 'contract', capabilities: ['sync'],
    fields: [field('base_url', 'API base URL', 'url', { required: true }), field('username', 'Username', 'text', { required: true }), field('password', 'Password', 'password', { required: true })],
  },
  {
    id: 'zoho_inventory', name: 'Zoho Inventory', category: 'operations', lifecycle: 'contract', capabilities: ['sync'],
    fields: [field('access_token', 'OAuth access token', 'password', { required: true }), field('api_domain', 'API domain', 'url', { defaultValue: 'https://www.zohoapis.com' }), field('organization_id', 'Organization ID', 'text')],
  },
  {
    id: 'erpnext', name: 'ERPNext', category: 'operations', lifecycle: 'contract', capabilities: ['sync'],
    fields: [field('endpoint', 'Site URL', 'url', { required: true }), field('api_key', 'API key', 'text', { required: true }), field('api_secret', 'API secret', 'password', { required: true })],
  },
  {
    id: 'freshdesk', name: 'Freshdesk', category: 'support', lifecycle: 'contract', capabilities: ['tickets', 'sync'],
    fields: [field('domain', 'Freshdesk domain', 'url', { required: true, placeholder: 'https://yourcompany.freshdesk.com' }), field('api_key', 'API key', 'password', { required: true })],
  },
  {
    id: 'zendesk', name: 'Zendesk', category: 'support', lifecycle: 'contract', capabilities: ['tickets', 'sync'],
    fields: [field('subdomain', 'Zendesk subdomain', 'text', { required: true }), field('email', 'Agent email', 'email', { required: true }), field('api_key', 'API token', 'password', { required: true })],
  },
  {
    id: 'intercom', name: 'Intercom', category: 'support', lifecycle: 'contract', capabilities: ['tickets', 'sync'],
    fields: [field('api_key', 'Access token', 'password', { required: true }), field('base_url', 'API base URL', 'url', { defaultValue: 'https://api.intercom.io' }), field('api_version', 'API version', 'text', { defaultValue: '2.11' })],
  },
  {
    id: 'signifyd', name: 'Signifyd', category: 'fraud', lifecycle: 'contract', capabilities: ['risk_score'],
    fields: [field('api_key', 'API key', 'password', { required: true }), field('base_url', 'API base URL', 'url', { defaultValue: 'https://api.signifyd.com' })],
  },
  {
    id: 'maxmind', name: 'MaxMind', category: 'fraud', lifecycle: 'contract', capabilities: ['risk_score'],
    fields: [field('account_id', 'Account ID', 'text', { required: true }), field('api_key', 'License key', 'password', { required: true }), field('test_url', 'minFraud URL', 'url', { defaultValue: 'https://minfraud.maxmind.com/minfraud/v2.0/score' })],
  },
  {
    id: 'razorpay_risk', name: 'Razorpay Risk', category: 'fraud', lifecycle: 'contract', capabilities: ['risk_score'],
    fields: [field('key_id', 'Key ID', 'text', { required: true }), field('key_secret', 'Key secret', 'password', { required: true }), field('test_url', 'API verification URL', 'url', { defaultValue: 'https://api.razorpay.com/v1/payments?count=1' })],
  },
];

module.exports = Object.freeze(catalog.reduce((result, definition) => {
  result[definition.id] = Object.freeze(definition);
  return result;
}, {}));
