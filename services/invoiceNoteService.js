const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const InvoiceNote = require('../models/InvoiceNote');
const Order = require('../models/Order');
const RefundRequest = require('../models/RefundRequest');
const ReturnRequest = require('../models/ReturnRequest');
const { normalizeTaxProfile, resolveTaxProfile, roundMoney } = require('./taxService');
const { nextInvoiceNumber } = require('./invoiceService');

const tenantIdOf = tenant => tenant?._id || tenant || null;
const noteTypes = ['credit', 'debit'];
const sourceTypes = ['manual', 'refund_request', 'return_request', 'order_adjustment'];

const noteError = (message, statusCode = 400, publicCode = 'INVOICE_NOTE_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const maskRecipient = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) {
    const [local, domain] = raw.split('@');
    return `${local.slice(0, 2)}${local.length > 2 ? '***' : '*'}@${domain}`;
  }
  const digits = raw.replace(/\D/g, '');
  return digits.length > 4 ? `******${digits.slice(-4)}` : '****';
};

const scopeFilter = tenant => (tenant ? { tenant: tenantIdOf(tenant) } : {});

const sourceExists = async ({ sourceType, sourceId, orderId, tenant, session }) => {
  if (sourceType === 'manual' || sourceType === 'order_adjustment') return null;
  if (!sourceId || !mongoose.isValidObjectId(sourceId)) throw noteError('A valid source record is required', 400, 'INVOICE_NOTE_SOURCE_INVALID');
  const Model = sourceType === 'refund_request' ? RefundRequest : ReturnRequest;
  const query = Model.findOne({ _id: sourceId, order: orderId, ...scopeFilter(tenant) }).select('_id status amount approvedAmount requestedAmount reason');
  if (session) query.session(session);
  const source = await query.lean();
  if (!source) throw noteError('Source refund/return record was not found for this order', 404, 'INVOICE_NOTE_SOURCE_NOT_FOUND');
  return source;
};

const scaled = (value, ratio) => roundMoney(Math.max(0, Number(value || 0) * ratio));

const buildNoteLines = ({ invoice, ratio, amount }) => {
  const sourceLines = Array.isArray(invoice.items) ? invoice.items : [];
  const lines = sourceLines.map((line, index) => {
    const taxableAmount = scaled(line.taxableAmount, ratio);
    const cgst = scaled(line.cgst, ratio);
    const sgst = scaled(line.sgst, ratio);
    const igst = scaled(line.igst, ratio);
    const otherTax = scaled(line.otherTax, ratio);
    return {
      lineType: line.lineType === 'shipping' ? 'shipping' : 'item',
      itemIndex: line.itemIndex ?? index,
      title: line.title || (line.lineType === 'shipping' ? 'Shipping' : 'Order adjustment'),
      hsnCode: line.hsnCode || '',
      quantity: Number(line.quantity || 0),
      taxableAmount,
      cgst,
      sgst,
      igst,
      otherTax,
      tax: roundMoney(cgst + sgst + igst + otherTax),
      total: roundMoney(taxableAmount + cgst + sgst + igst + otherTax),
    };
  });
  const represented = roundMoney(lines.reduce((sum, line) => sum + line.total, 0));
  const residual = roundMoney(Number(amount) - represented);
  if (Math.abs(residual) >= 0.01) {
    lines.push({
      lineType: 'adjustment', itemIndex: null, title: 'Invoice adjustment', hsnCode: '', quantity: 1,
      taxableAmount: residual > 0 ? residual : 0, cgst: 0, sgst: 0, igst: 0, otherTax: 0, tax: 0,
      total: residual > 0 ? residual : 0,
    });
  }
  return lines;
};

const createInternal = async ({ invoiceId, tenant, type, amount, reason, sourceType = 'manual', sourceId, idempotencyKey, issuedBy, session }) => {
  const tenantId = tenantIdOf(tenant);
  if (!tenantId || !mongoose.isValidObjectId(invoiceId)) throw noteError('Tenant and invoice are required', 400, 'INVOICE_NOTE_CONTEXT_INVALID');
  if (!noteTypes.includes(type)) throw noteError('Note type must be credit or debit', 400, 'INVOICE_NOTE_TYPE_INVALID');
  if (!sourceTypes.includes(sourceType)) throw noteError('Invalid invoice note source', 400, 'INVOICE_NOTE_SOURCE_INVALID');
  const key = String(idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw noteError('A valid Idempotency-Key is required', 400, 'IDEMPOTENCY_KEY_REQUIRED');
  const existingQuery = InvoiceNote.findOne({ tenant: tenantId, idempotencyKey: key }).select('+idempotencyKey').lean();
  if (session) existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) {
    if (String(existing.invoice) !== String(invoiceId) || existing.type !== type) throw noteError('Idempotency key was already used for another invoice note', 409, 'IDEMPOTENCY_KEY_REUSED');
    return { note: existing, idempotent: true };
  }

  const invoiceQuery = Invoice.findOne({ _id: invoiceId, tenant: tenantId, documentType: 'tax_invoice', status: 'issued' }).lean();
  if (session) invoiceQuery.session(session);
  const invoice = await invoiceQuery;
  if (!invoice) throw noteError('Issued tax invoice was not found for this tenant', 404, 'INVOICE_NOT_FOUND');
  const safeAmount = roundMoney(Number(amount));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) throw noteError('Note amount must be greater than zero', 400, 'INVOICE_NOTE_AMOUNT_INVALID');
  if (safeAmount > roundMoney(invoice.total)) throw noteError('Note amount cannot exceed the original invoice total', 400, 'INVOICE_NOTE_AMOUNT_EXCEEDS_INVOICE');

  const priorQuery = InvoiceNote.find({ tenant: tenantId, invoice: invoice._id, type, status: 'issued' }).select('total').lean();
  if (session) priorQuery.session(session);
  const prior = await priorQuery;
  const alreadyNoted = roundMoney(prior.reduce((sum, item) => sum + Number(item.total || 0), 0));
  if (roundMoney(alreadyNoted + safeAmount) > roundMoney(invoice.total)) throw noteError('The cumulative note amount cannot exceed the original invoice total', 409, 'INVOICE_NOTE_LIMIT_REACHED');
  await sourceExists({ sourceType, sourceId, orderId: invoice.order, tenant: tenantId, session });

  const profile = normalizeTaxProfile(await resolveTaxProfile({ tenant: tenantId, session }));
  const noteNumber = await nextInvoiceNumber({
    tenant: tenantId,
    profile,
    dateValue: new Date(),
    session,
    prefixOverride: `${profile.invoicePrefix}-${type === 'credit' ? 'CN' : 'DN'}`,
    scopeSuffix: `note-${type}`,
  });
  const ratio = invoice.total > 0 ? safeAmount / Number(invoice.total) : 0;
  const note = {
    tenant: tenantId,
    order: invoice.order,
    invoice: invoice._id,
    orderNumber: invoice.orderNumber,
    originalInvoiceNumber: invoice.invoiceNumber,
    noteNumber,
    type,
    status: 'issued',
    sourceType,
    ...(sourceId ? { sourceId } : {}),
    reason: String(reason || '').trim().slice(0, 500),
    seller: invoice.seller || {},
    buyer: invoice.buyer || {},
    items: buildNoteLines({ invoice, ratio, amount: safeAmount }),
    subtotal: scaled(invoice.subtotal, ratio),
    taxableAmount: scaled(invoice.taxableAmount, ratio),
    cgst: scaled(invoice.cgst, ratio),
    sgst: scaled(invoice.sgst, ratio),
    igst: scaled(invoice.igst, ratio),
    otherTax: scaled(invoice.otherTax, ratio),
    tax: scaled(invoice.tax, ratio),
    total: safeAmount,
    currency: invoice.currency || 'INR',
    invoiceNote: `${type === 'credit' ? 'Credit' : 'Debit'} note against ${invoice.invoiceNumber}`,
    issuedBy,
    idempotencyKey: key,
  };
  try {
    const created = await InvoiceNote.create([note], session ? { session } : undefined);
    return { note: created[0].toObject(), idempotent: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const duplicateQuery = InvoiceNote.findOne({ tenant: tenantId, idempotencyKey: key }).select('+idempotencyKey').lean();
    if (session) duplicateQuery.session(session);
    const duplicate = await duplicateQuery;
    if (duplicate && String(duplicate.invoice) === String(invoiceId) && duplicate.type === type) return { note: duplicate, idempotent: true };
    throw noteError('Invoice note idempotency key was already used', 409, 'IDEMPOTENCY_KEY_REUSED');
  }
};

const createInvoiceNote = async args => {
  if (args.session) return createInternal(args);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await createInternal({ ...args, session }); });
  } finally { await session.endSession(); }
  return result;
};

const getInvoiceNote = async ({ id, tenant, userId, isAdmin = false } = {}) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const note = await InvoiceNote.findOne({ _id: id, tenant: tenantIdOf(tenant) }).lean();
  if (!note) return null;
  if (!isAdmin) {
    const order = await Order.findOne({ _id: note.order, tenant: tenantIdOf(tenant), user: userId }).select('_id').lean();
    if (!order) return null;
  }
  return note;
};

const listInvoiceNotes = async ({ tenant, page = 1, limit = 20, type, status, search, order, userId, isAdmin = false } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const query = { tenant: tenantIdOf(tenant) };
  if (type && noteTypes.includes(type)) query.type = type;
  if (status && ['issued', 'void'].includes(status)) query.status = status;
  if (order && mongoose.isValidObjectId(order)) query.order = order;
  if (search) {
    const escaped = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ noteNumber: { $regex: escaped, $options: 'i' } }, { originalInvoiceNumber: { $regex: escaped, $options: 'i' } }, { orderNumber: { $regex: escaped, $options: 'i' } }, { 'buyer.name': { $regex: escaped, $options: 'i' } }];
  }
  if (userId && !isAdmin) {
    const orders = await Order.find({ tenant: tenantIdOf(tenant), user: userId }).select('_id').lean();
    query.order = { $in: orders.map(item => item._id) };
  }
  const [total, notes] = await Promise.all([
    InvoiceNote.countDocuments(query),
    InvoiceNote.find(query).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
  ]);
  return { notes, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

const voidInvoiceNote = async ({ id, tenant, reason = '', actorId } = {}) => {
  const note = await InvoiceNote.findOne({ _id: id, tenant: tenantIdOf(tenant) });
  if (!note) throw noteError('Invoice note not found', 404, 'INVOICE_NOTE_NOT_FOUND');
  if (note.status !== 'void') {
    note.status = 'void';
    note.voidedAt = new Date();
    note.voidReason = String(reason || '').trim().slice(0, 500);
    note.issuedBy = note.issuedBy || actorId;
    await note.save();
  }
  return { note: note.toObject(), idempotent: note.status === 'void' };
};

module.exports = {
  createInvoiceNote,
  getInvoiceNote,
  listInvoiceNotes,
  voidInvoiceNote,
  maskRecipient,
  noteTypes,
  sourceTypes,
};
