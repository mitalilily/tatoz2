const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const { ensureInvoiceForOrder, getInvoiceForOrder, listInvoices } = require('../services/invoiceService');

const getCustomerInvoice = asyncHandler(async (req, res) => {
  const invoice = await getInvoiceForOrder({
    orderId: req.params.orderId,
    tenant: req.tenant,
    userId: req.user._id,
    // The admin order screen uses the same authoritative order endpoint. An
    // admin must be able to generate a customer's invoice, while normal
    // customers remain restricted to their own orders.
    isAdmin: ['admin', 'superadmin'].includes(req.user.role),
  });
  if (!invoice) { res.status(404); throw new Error('Invoice not found'); }
  res.json({ success: true, invoice });
});

const getAdminInvoices = asyncHandler(async (req, res) => {
  const result = await listInvoices({ tenant: req.tenant, ...req.query });
  res.json({ success: true, ...result });
});

const getVendorInvoices = asyncHandler(async (req, res) => {
  if (!req.vendor?._id) { res.status(404); throw new Error('Seller profile not found'); }
  const result = await listInvoices({
    tenant: req.vendor.tenant,
    vendor: req.vendor._id,
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    documentType: req.query.documentType,
  });
  res.json({ success: true, ...result });
});

const getAdminInvoice = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404); throw new Error('Invoice not found'); }
  let invoice = await Invoice.findOne({ _id: req.params.id, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).lean();
  if (!invoice) { res.status(404); throw new Error('Invoice not found'); }
  if (!invoice.order) { res.status(404); throw new Error('Invoice order not found'); }
  if (!invoice.invoiceNumber) {
    invoice = await ensureInvoiceForOrder({ order: invoice.order, tenant: req.tenant, source: 'admin' });
  }
  res.json({ success: true, invoice });
});

const voidAdminInvoice = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404); throw new Error('Invoice not found'); }
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const invoice = await Invoice.findOne({ _id: req.params.id, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (!invoice) { res.status(404); throw new Error('Invoice not found'); }
  if (invoice.status !== 'void') {
    invoice.status = 'void';
    invoice.voidedAt = new Date();
    invoice.voidReason = reason;
    await invoice.save();
  }
  res.json({ success: true, invoice, idempotent: invoice.status === 'void' && Boolean(invoice.voidedAt) });
});

module.exports = { getCustomerInvoice, getVendorInvoices, getAdminInvoices, getAdminInvoice, voidAdminInvoice };
