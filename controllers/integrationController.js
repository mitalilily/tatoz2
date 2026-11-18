const asyncHandler = require('express-async-handler');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const { findPlatformTenant } = require('../services/tenantService');
const smtp = require('../services/integrations/smtpAdapter');
const { normalizeEmail } = require('../utils/adminValidation');
const { PLATFORM_NAME } = require('../constants/branding');

const platformTenant = async () => {
  const tenant = await findPlatformTenant();
  if (!tenant) {
    const error = new Error('Platform tenant is not configured');
    error.statusCode = 503;
    throw error;
  }
  return tenant;
};

const getIntegrations = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  const integrations = await tenantIntegrationService.listPublic(tenant);
  res.json({ success: true, tenant: { id: tenant._id, key: tenant.key, name: tenant.name }, integrations, canManage: req.user?.role === 'superadmin' });
});

const updateIntegration = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const tenant = await platformTenant();
  const integration = await tenantIntegrationService.saveProvider(tenant, provider, req.body, req.user._id);
  res.json({ success: true, message: `${integration.name} configuration saved`, integration });
});

const testIntegration = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  const result = await tenantIntegrationService.testProvider(tenant, req.params.provider, req.body || {}, req.user._id);
  res.json({ success: true, status: result.status, message: result.message, latencyMs: result.latencyMs, verificationToken: result.verificationToken });
});

const clearIntegration = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  await tenantIntegrationService.clearProvider(tenant, req.params.provider, 'default', req.user._id);
  res.json({ success: true, message: 'Integration credentials removed' });
});

const sendSmtpTestEmail = asyncHandler(async (req, res) => {
  const to = normalizeEmail(req.body?.to, 'Test recipient');
  if (!to || /[,;<>]/.test(to)) {
    res.status(400);
    throw new Error('Enter one email address for the test recipient');
  }

  const tenant = await platformTenant();
  const config = await tenantIntegrationService.configFor(tenant._id, 'smtp');
  if (!smtp.isConfigured(config)) {
    res.status(409);
    throw new Error('Save and enable SMTP before sending a test email');
  }
  try {
    await smtp.sendEmail({
      to,
      subject: `${PLATFORM_NAME} SMTP test`,
      text: `This test email was sent from the ${PLATFORM_NAME} admin panel using your saved SMTP configuration.`,
    }, config);
  } catch (error) {
    console.error('SMTP test delivery failed:', error.code || error.name);
    res.status(502);
    throw new Error('SMTP did not accept the test email. Check the sender address and mailbox credentials.');
  }
  res.json({ success: true, message: 'SMTP accepted the test email. Check the recipient inbox.' });
});

module.exports = { getIntegrations, updateIntegration, testIntegration, clearIntegration, sendSmtpTestEmail };
