const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  fullName: { type: String, default: '', maxlength: 200 },
  phone: { type: String, default: '', maxlength: 40 },
  street: { type: String, default: '', maxlength: 300 },
  line1: { type: String, default: '', maxlength: 200 },
  line2: { type: String, default: '', maxlength: 200 },
  city: { type: String, default: '', maxlength: 100 },
  state: { type: String, default: '', maxlength: 100 },
  pincode: { type: String, default: '', maxlength: 20 },
  country: { type: String, default: 'India', maxlength: 80 },
}, { _id: false });

const lineSchema = new mongoose.Schema({
  lineType: { type: String, enum: ['item', 'shipping', 'adjustment'], default: 'item' },
  itemIndex: Number,
  title: { type: String, default: '', maxlength: 300 },
  hsnCode: { type: String, default: '', maxlength: 30 },
  quantity: { type: Number, default: 1, min: 0 },
  taxableAmount: { type: Number, default: 0, min: 0 },
  cgst: { type: Number, default: 0, min: 0 },
  sgst: { type: Number, default: 0, min: 0 },
  igst: { type: Number, default: 0, min: 0 },
  otherTax: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0, min: 0 },
}, { _id: false });

const invoiceNoteSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  orderNumber: { type: String, required: true, maxlength: 100 },
  originalInvoiceNumber: { type: String, required: true, maxlength: 100 },
  noteNumber: { type: String, required: true, unique: true, index: true, maxlength: 100 },
  type: { type: String, enum: ['credit', 'debit'], required: true, index: true },
  status: { type: String, enum: ['issued', 'void'], default: 'issued', index: true },
  sourceType: { type: String, enum: ['manual', 'refund_request', 'return_request', 'order_adjustment'], default: 'manual' },
  sourceId: { type: mongoose.Schema.Types.ObjectId },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  seller: { businessName: String, gstin: String, state: String, address: mongoose.Schema.Types.Mixed },
  buyer: {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    gstin: { type: String, default: '' },
    address: { type: addressSchema, default: () => ({}) },
  },
  items: { type: [lineSchema], default: [] },
  subtotal: { type: Number, default: 0, min: 0 },
  taxableAmount: { type: Number, default: 0, min: 0 },
  cgst: { type: Number, default: 0, min: 0 },
  sgst: { type: Number, default: 0, min: 0 },
  igst: { type: Number, default: 0, min: 0 },
  otherTax: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR', maxlength: 10 },
  invoiceNote: { type: String, default: '', maxlength: 500 },
  issuedAt: { type: Date, default: Date.now },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  idempotencyKey: { type: String, required: true, select: false },
  voidedAt: Date,
  voidReason: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

invoiceNoteSchema.index({ tenant: 1, idempotencyKey: 1 }, { unique: true });
invoiceNoteSchema.index({ tenant: 1, createdAt: -1 });
invoiceNoteSchema.index({ tenant: 1, order: 1, status: 1 });

module.exports = mongoose.model('InvoiceNote', invoiceNoteSchema);
