jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../services/integrationService', () => ({ getProviderConfig: jest.fn() }));
jest.mock('../services/tenantIntegrationService', () => ({ configFor: jest.fn() }));
jest.mock('../services/tenantService', () => ({ findPlatformTenant: jest.fn() }));
jest.mock('../services/outboxService', () => ({ enqueue: jest.fn() }));

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

test('queued email prefers the saved SMTP mailbox and falls back when it is unavailable', async () => {
  configFor.mockResolvedValueOnce(config).mockResolvedValueOnce({ enabled: false });
  await expect(emailService.queuedEmailProvider('tenant-a')).resolves.toBe('smtp');
  await expect(emailService.queuedEmailProvider('tenant-b')).resolves.toBe('brevo');
  expect(configFor.mock.calls).toEqual([['tenant-a', 'smtp'], ['tenant-b', 'smtp']]);
});

test('the invoice delivery service retains the existing provider defaults', () => {
  const { providerFor } = require('../services/invoiceDeliveryService');
  expect(providerFor('email')).toBe('brevo');
  expect(providerFor('whatsapp')).toBe('wati');
});

test.each(['transactional', 'marketing'])('%s notifications queue through the saved SMTP mailbox', async purpose => {
  const IntegrationDelivery = require('../models/IntegrationDelivery');
  const { enqueue } = require('../services/outboxService');
  const notifications = require('../services/notificationDeliveryService');
  configFor.mockResolvedValue(config);
  jest.spyOn(IntegrationDelivery, 'findOneAndUpdate').mockResolvedValue({ _id: 'delivery-a', status: 'queued' });

  await notifications.send({ tenant: 'tenant-a', channel: 'email', email: 'buyer@example.test', purpose, eventType: 'test', subject: 'Example', body: 'Test' });

  expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
    type: 'notification.email',
    payload: expect.objectContaining({ provider: 'smtp', email: 'buyer@example.test' }),
  }));
});

test('SMTP campaigns continue to require customer marketing consent', async () => {
  const CommunicationConsent = require('../models/CommunicationConsent');
  const { enqueue } = require('../services/outboxService');
  const notifications = require('../services/notificationDeliveryService');
  jest.spyOn(CommunicationConsent, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

  await expect(notifications.send({ tenant: 'tenant-a', channel: 'email', email: 'buyer@example.test', userId: 'customer-a', purpose: 'marketing', eventType: 'test' })).rejects.toThrow('not consented');
  expect(enqueue).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});

test('invoice workers send documents using the saved SMTP sender', async () => {
  const Invoice = require('../models/Invoice');
  const InvoiceDelivery = require('../models/InvoiceDelivery');
  const { processInvoiceDelivery } = require('../services/invoiceDeliveryService');
  configFor.mockResolvedValue(config);
  jest.spyOn(InvoiceDelivery, 'findOneAndUpdate').mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: 'delivery-a', invoice: 'invoice-a', provider: 'smtp', channel: 'email', recipient: 'buyer@example.test', attempts: 1 }),
  });
  jest.spyOn(Invoice, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue({ invoiceNumber: 'INV-TEST', orderNumber: 'ORDER-TEST', total: 100 }) });
  jest.spyOn(InvoiceDelivery, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

  await expect(processInvoiceDelivery({ deliveryId: 'delivery-a', tenant: 'tenant-a' })).resolves.toEqual({ status: 'sent', externalId: 'test-message-id' });
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: config.from, to: 'buyer@example.test', subject: 'Invoice INV-TEST' }));
  expect(InvoiceDelivery.updateOne).toHaveBeenCalledWith({ _id: 'delivery-a' }, expect.objectContaining({ $set: expect.objectContaining({ status: 'sent' }) }));
});
