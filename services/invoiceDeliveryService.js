const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const InvoiceNote = require('../models/InvoiceNote');
const InvoiceDelivery = require('../models/InvoiceDelivery');
const Order = require('../models/Order');
const tenantIntegrationService = require('./tenantIntegrationService');
const { getAdapter } = require('./integrations/providerRegistry');
const { enqueue } = require('./outboxService');
const { isChannelAllowed } = require('./notificationDeliveryService');
const { queuedEmailProvider } = require('./emailService');
require('./integrations/registerBuiltins');

const tenantIdOf = tenant => tenant?._id || tenant || null;
const providerFor = channel => channel === 'email' ? 'brevo' : channel === 'whatsapp' ? 'wati' : null;
const deliveryError = (message, statusCode = 400, publicCode = 'INVOICE_DELIVERY_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const sourceDocument = async ({ tenant, invoiceId, noteId }) => {
  const tenantId = tenantIdOf(tenant);
  if (noteId) {
    if (!mongoose.isValidObjectId(noteId)) throw deliveryError('Invalid invoice note', 400, 'INVOICE_NOTE_NOT_FOUND');
    const note = await InvoiceNote.findOne({ _id: noteId, tenant: tenantId }).lean();
    if (!note) throw deliveryError('Invoice note not found', 404, 'INVOICE_NOTE_NOT_FOUND');
    return { document: note, kind: 'note', invoiceId: note.invoice, orderId: note.order };
  }
  if (!mongoose.isValidObjectId(invoiceId)) throw deliveryError('Invalid invoice', 400, 'INVOICE_NOT_FOUND');
  const invoice = await Invoice.findOne({ _id: invoiceId, tenant: tenantId }).lean();
  if (!invoice) throw deliveryError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  return { document: invoice, kind: 'invoice', invoiceId: invoice._id, orderId: invoice.order };
};

const recipientFor = ({ document, channel }) => {
  const recipient = channel === 'email' ? document.buyer?.email : document.buyer?.phone;
  if (!String(recipient || '').trim()) throw deliveryError(`Customer ${channel} is not available for this document`, 400, 'INVOICE_RECIPIENT_MISSING');
  return String(recipient).trim();
};

const maskRecipient = value => {
  const raw = String(value || '').trim();
  if (raw.includes('@')) {
    const [local, domain] = raw.split('@');
    return `${local.slice(0, 2)}${local.length > 2 ? '***' : '*'}@${domain}`;
  }
  const digits = raw.replace(/\D/g, '');
  return digits.length > 4 ? `******${digits.slice(-4)}` : '****';
};

const queueInvoiceDelivery = async ({ tenant, invoiceId, noteId, channel, idempotencyKey, requestedBy } = {}) => {
  const tenantId = tenantIdOf(tenant);
  const fallbackProvider = providerFor(channel);
  if (!tenantId) throw deliveryError('Tenant context is required', 400, 'TENANT_REQUIRED');
  if (!fallbackProvider) throw deliveryError('Invoice delivery channel must be email or whatsapp', 400, 'INVOICE_CHANNEL_INVALID');
  const key = String(idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw deliveryError('A valid Idempotency-Key is required', 400, 'IDEMPOTENCY_KEY_REQUIRED');
  const source = await sourceDocument({ tenant: tenantId, invoiceId, noteId });
  if (source.document.status === 'void') throw deliveryError('A void document cannot be delivered', 409, 'INVOICE_DOCUMENT_VOID');
  const order = await Order.findOne({ _id: source.orderId, tenant: tenantId }).select('user orderNumber').lean();
  if (!order) throw deliveryError('Order for this document was not found', 404, 'ORDER_NOT_FOUND');
  const recipient = recipientFor({ document: source.document, channel });
  if (order.user) {
    const allowed = await isChannelAllowed({ tenant: tenantId, userId: order.user, channel, purpose: 'transactional' });
    if (!allowed) throw deliveryError(`Customer has disabled ${channel} transactional messages`, 409, 'INVOICE_DELIVERY_CONSENT_REQUIRED');
  }
  const existing = await InvoiceDelivery.findOne({ tenant: tenantId, idempotencyKey: key }).lean();
  if (existing) {
    const sameDocument = String(existing.invoice || '') === String(source.invoiceId || '') && String(existing.note || '') === String(noteId || '') && existing.channel === channel;
    if (!sameDocument) throw deliveryError('Delivery idempotency key was already used for another document', 409, 'IDEMPOTENCY_KEY_REUSED');
    return { delivery: existing, idempotent: true };
  }
  const eventType = `invoice.document.${channel}`;
  const provider = channel === 'email' ? await queuedEmailProvider(tenantId) : fallbackProvider;
  const delivery = await InvoiceDelivery.create({
    tenant: tenantId,
    ...(source.kind === 'invoice' ? { invoice: source.document._id } : { note: source.document._id }),
    order: source.orderId,
    channel,
    provider,
    recipient,
    recipientMasked: maskRecipient(recipient),
    status: 'queued',
    eventType,
    idempotencyKey: key,
  });
  await enqueue({
    tenant: tenantId,
    type: eventType,
    aggregateType: 'InvoiceDelivery',
    aggregateId: delivery._id,
    idempotencyKey: `invoice-delivery:${delivery._id}`,
    payload: { deliveryId: String(delivery._id), requestedBy: requestedBy ? String(requestedBy) : '' },
  });
  const safe = delivery.toObject();
  delete safe.recipient;
  return { delivery: safe, idempotent: false };
};

const processInvoiceDelivery = async ({ deliveryId, tenant } = {}) => {
  const tenantId = tenantIdOf(tenant);
  const delivery = await InvoiceDelivery.findOneAndUpdate(
    { _id: deliveryId, tenant: tenantId, status: { $in: ['queued', 'failed'] } },
    { $set: { status: 'processing' }, $inc: { attempts: 1 } },
    { new: true },
  ).select('+recipient');
  if (!delivery) return null;
  try {
    const config = await tenantIntegrationService.configFor(tenantId, delivery.provider, { allowPlatformFallback: true });
    if (!config.enabled) throw deliveryError(`${delivery.provider} is not configured for this tenant`, 503, 'INVOICE_PROVIDER_UNAVAILABLE');
    const adapter = getAdapter(delivery.provider);
    if (!adapter) throw deliveryError(`${delivery.provider} adapter is not activated`, 503, 'INVOICE_PROVIDER_UNAVAILABLE');
    const source = delivery.note
      ? await InvoiceNote.findOne({ _id: delivery.note, tenant: tenantId }).lean()
      : await Invoice.findOne({ _id: delivery.invoice, tenant: tenantId }).lean();
    if (!source) throw deliveryError('Invoice document no longer exists', 404, 'INVOICE_DOCUMENT_NOT_FOUND');
    const label = source.noteNumber || source.invoiceNumber;
    const subject = `${source.type ? `${source.type === 'credit' ? 'Credit' : 'Debit'} note` : 'Invoice'} ${label}`;
    const appOrigin = String(process.env.CLIENT_URL || '').replace(/\/$/, '');
    const orderLink = appOrigin && delivery.order ? `${appOrigin}/orders/${delivery.order}` : '';
    let result;
    if (delivery.channel === 'email') {
      result = await adapter.sendEmail({
        to: delivery.recipient,
        subject,
        html: `<p>Your ${source.type ? `${source.type} note` : 'invoice'} <strong>${label}</strong> is ready.</p><p>Order: ${source.orderNumber}</p><p>Total: ${source.currency || 'INR'} ${Number(source.total || 0).toFixed(2)}</p>${orderLink ? `<p><a href="${orderLink}">View order</a></p>` : ''}`,
        sender: config.sender_email ? { email: config.sender_email } : undefined,
      }, config);
    } else {
      result = await adapter.sendTemplateMessage({
        phone: delivery.recipient,
        templateName: config.invoice_template_name || 'invoice_ready',
        parameters: [{ name: 'document_number', value: label }, { name: 'order_number', value: source.orderNumber }, { name: 'total', value: Number(source.total || 0).toFixed(2) }],
      }, config);
    }
    await InvoiceDelivery.updateOne({ _id: delivery._id }, { $set: { status: result.status === 'failed' ? 'failed' : 'sent', externalId: result.externalId || '', sentAt: new Date(), error: result.status === 'failed' ? 'Provider rejected delivery' : '' } });
    return result;
  } catch (error) {
    await InvoiceDelivery.updateOne({ _id: delivery._id }, { $set: { status: delivery.attempts >= 5 ? 'dead_letter' : 'failed', error: String(error.message || 'Invoice delivery failed').slice(0, 500), nextAttemptAt: new Date(Date.now() + Math.min(3600000, (2 ** delivery.attempts) * 1000)) } });
    throw error;
  }
};

const listInvoiceDeliveries = async ({ tenant, page = 1, limit = 50, invoice, note, status } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const query = { tenant: tenantIdOf(tenant), ...(invoice ? { invoice } : {}), ...(note ? { note } : {}) };
  if (['queued', 'processing', 'sent', 'delivered', 'failed', 'dead_letter'].includes(status)) query.status = status;
  const [total, deliveries] = await Promise.all([
    InvoiceDelivery.countDocuments(query),
    InvoiceDelivery.find(query).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
  ]);
  return { deliveries, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

module.exports = { queueInvoiceDelivery, processInvoiceDelivery, listInvoiceDeliveries, providerFor };
