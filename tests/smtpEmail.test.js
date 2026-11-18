jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../services/integrationService', () => ({ getProviderConfig: jest.fn() }));
jest.mock('../services/tenantIntegrationService', () => ({ configFor: jest.fn() }));
jest.mock('../services/tenantService', () => ({ findPlatformTenant: jest.fn() }));

const nodemailer = require('nodemailer');
const { getProviderConfig } = require('../services/integrationService');
const { configFor } = require('../services/tenantIntegrationService');
const { findPlatformTenant } = require('../services/tenantService');
const smtp = require('../services/integrations/smtpAdapter');
const emailService = require('../services/emailService');

const config = { enabled: true, host: 'smtp.example.test', port: 587, user: 'sender@example.test', pass: 'demo-secret', from: 'sender@example.test' };
const verify = jest.fn();
const sendMail = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  nodemailer.createTransport.mockReturnValue({ verify, sendMail });
  sendMail.mockResolvedValue({ accepted: ['buyer@example.test'], messageId: 'test-message-id' });
});

test('the SMTP verification and send paths require STARTTLS on port 587', async () => {
  await smtp.testConnection(config);
  await smtp.sendEmail({ to: 'buyer@example.test', subject: 'Example', text: 'Test mail' }, config);
  expect(nodemailer.createTransport).toHaveBeenNthCalledWith(1, expect.objectContaining({ port: 587, secure: false, requireTLS: true }));
  expect(nodemailer.createTransport).toHaveBeenNthCalledWith(2, expect.objectContaining({ port: 587, secure: false, requireTLS: true }));
  expect(verify).toHaveBeenCalledTimes(1);
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: config.from, to: 'buyer@example.test' }));
});

test('port 465 uses implicit TLS and a rejected recipient fails delivery', async () => {
  sendMail.mockResolvedValue({ accepted: [] });
  await expect(smtp.sendEmail({ to: 'buyer@example.test', subject: 'Example', text: 'Test' }, { ...config, port: 465 })).rejects.toThrow('did not accept');
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: false }));
});

test('direct emails resolve the same tenant SMTP connection as cart OTP', async () => {
  configFor.mockResolvedValue(config);
  await emailService.sendWelcome({ name: 'Buyer', email: 'buyer@example.test' }, 'tenant-a');
  await emailService.sendVerificationOtp({ tenantId: 'tenant-a', to: 'buyer@example.test', otp: '123456' });
  expect(configFor.mock.calls).toEqual([['tenant-a', 'smtp'], ['tenant-a', 'smtp']]);
  expect(sendMail).toHaveBeenCalledTimes(2);
  expect(sendMail.mock.calls[1][0].text).toContain('123456');
});

test('platform delivery retains the legacy configuration when a platform tenant is absent', async () => {
  findPlatformTenant.mockResolvedValue(null);
  getProviderConfig.mockResolvedValue(config);
  await emailService.sendEmail({ to: 'buyer@example.test', subject: 'Example', text: 'Test' });
  expect(getProviderConfig).toHaveBeenCalledWith('smtp');
  expect(sendMail).toHaveBeenCalledTimes(1);
});

test('queued transactional email keeps active Brevo and otherwise selects configured SMTP', async () => {
  configFor.mockResolvedValueOnce({ enabled: true }).mockResolvedValueOnce({ enabled: false }).mockResolvedValueOnce(config);
  await expect(emailService.queuedEmailProvider('tenant-a')).resolves.toBe('brevo');
  await expect(emailService.queuedEmailProvider('tenant-b')).resolves.toBe('smtp');
  expect(configFor.mock.calls).toEqual([['tenant-a', 'brevo'], ['tenant-b', 'brevo'], ['tenant-b', 'smtp']]);
});
