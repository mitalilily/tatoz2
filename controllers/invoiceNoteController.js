const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const {
  createInvoiceNote,
  getInvoiceNote,
  listInvoiceNotes,
  voidInvoiceNote,
} = require('../services/invoiceNoteService');
const {
  queueInvoiceDelivery,
  listInvoiceDeliveries,
} = require('../services/invoiceDeliveryService');

const safeNote = note => {
  if (!note) return note;
  const output = { ...note };
  delete output.idempotencyKey;
  return output;
};

const getCustomerInvoiceNotes = asyncHandler(async (req, res) => {
  const result = await listInvoiceNotes({
    tenant: req.tenant,
    order: req.params.orderId,
    userId: req.user._id,
    isAdmin: false,
    page: req.query.page,
    limit: req.query.limit,
    status: 'issued',
  });
  res.json({ success: true, ...result, notes: result.notes.map(safeNote) });
});

const getAdminInvoiceNotes = asyncHandler(async (req, res) => {
  const result = await listInvoiceNotes({ tenant: req.tenant, ...req.query, isAdmin: true });
  res.json({ success: true, ...result, notes: result.notes.map(safeNote) });
});

const getAdminInvoiceNote = asyncHandler(async (req, res) => {
  const note = await getInvoiceNote({ id: req.params.id, tenant: req.tenant, isAdmin: true });
  if (!note) { res.status(404); throw new Error('Invoice note not found'); }
  res.json({ success: true, note: safeNote(note) });
});

const createAdminInvoiceNote = asyncHandler(async (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  const result = await createInvoiceNote({
    invoiceId: req.params.invoiceId,
    tenant: req.tenant,
    type: req.body?.type,
    amount: req.body?.amount,
    reason: req.body?.reason,
    sourceType: req.body?.sourceType,
    sourceId: req.body?.sourceId,
    idempotencyKey,
    issuedBy: req.user._id,
  });
  res.status(result.idempotent ? 200 : 201).json({ success: true, idempotent: result.idempotent, note: safeNote(result.note) });
});

const voidAdminInvoiceNote = asyncHandler(async (req, res) => {
  const result = await voidInvoiceNote({ id: req.params.id, tenant: req.tenant, reason: req.body?.reason, actorId: req.user._id });
  res.json({ success: true, idempotent: result.idempotent, note: safeNote(result.note) });
});

const deliverAdminInvoiceDocument = asyncHandler(async (req, res) => {
  const channel = String(req.body?.channel || '').toLowerCase();
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  const result = await queueInvoiceDelivery({
    tenant: req.tenant,
    invoiceId: req.body?.invoiceId || req.params.invoiceId,
    noteId: req.body?.noteId || req.params.noteId,
    channel,
    idempotencyKey,
    requestedBy: req.user._id,
  });
  res.status(result.idempotent ? 200 : 202).json({ success: true, idempotent: result.idempotent, delivery: result.delivery });
});

const getAdminInvoiceDeliveries = asyncHandler(async (req, res) => {
  res.json({ success: true, ...await listInvoiceDeliveries({ tenant: req.tenant, ...req.query }) });
});

module.exports = {
  getCustomerInvoiceNotes,
  getAdminInvoiceNotes,
  getAdminInvoiceNote,
  createAdminInvoiceNote,
  voidAdminInvoiceNote,
  deliverAdminInvoiceDocument,
  getAdminInvoiceDeliveries,
};
