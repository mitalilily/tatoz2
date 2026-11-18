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

const invoiceLineSchema = new mongoose.Schema({
  lineType: { type: String, enum: ['item', 'shipping', 'commission', 'courier'], default: 'item' },
  itemIndex: Number,
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  title: { type: String, default: '', maxlength: 300 },
  sku: { type: String, default: '', maxlength: 100 },
  hsnCode: { type: String, default: '', maxlength: 30 },
  quantity: { type: Number, default: 1, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
  rate: { type: Number, default: 0, min: 0, max: 100 },
  grossAmount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  taxableAmount: { type: Number, default: 0, min: 0 },
  cgst: { type: Number, default: 0, min: 0 },
  sgst: { type: Number, default: 0, min: 0 },
  igst: { type: Number, default: 0, min: 0 },
  otherTax: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  sellerGstin: { type: String, default: '' },
  sellerState: { type: String, default: '' },
  sellerBusinessName: { type: String, default: '' },
  sellerBusinessAddress: { type: mongoose.Schema.Types.Mixed, default: {} },
  invoicePrefix: { type: String, default: '' },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null, index: true },
  orderNumber: { type: String, required: true, maxlength: 100 },
  invoiceNumber: { type: String, required: true, unique: true, index: true, maxlength: 100 },
  // Each commercial order revision gets a new immutable invoice snapshot.
  // Older snapshots are voided and linked rather than overwritten.
  revision: { type: Number, required: true, min: 1, default: 1 },
  supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true },
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true },
  documentType: { type: String, enum: ['tax_invoice', 'commission_invoice', 'courier_invoice', 'proforma', 'credit_note', 'debit_note'], default: 'tax_invoice' },
  invoiceKind: { type: String, enum: ['sale', 'commission', 'courier', 'other'], default: 'sale', index: true },
  status: { type: String, enum: ['issued', 'void'], default: 'issued', index: true },
  source: { type: String, enum: ['automatic', 'admin'], default: 'automatic' },
  issueDate: { type: Date, default: Date.now },
  seller: {
    businessName: { type: String, default: '' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' },
    address: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  buyer: {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    gstin: { type: String, default: '' },
    address: { type: addressSchema, default: () => ({}) },
  },
  items: { type: [invoiceLineSchema], default: [] },
  subtotal: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  shippingCost: { type: Number, default: 0, min: 0 },
  taxableAmount: { type: Number, default: 0, min: 0 },
  cgst: { type: Number, default: 0, min: 0 },
  sgst: { type: Number, default: 0, min: 0 },
  igst: { type: Number, default: 0, min: 0 },
  otherTax: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'INR', maxlength: 10 },
  paymentMethod: { type: String, default: '' },
  paymentStatus: { type: String, default: 'pending' },
  taxMode: { type: String, enum: ['exclusive', 'inclusive'], default: 'exclusive' },
  taxRegistrationType: { type: String, enum: ['unregistered', 'gstin'], default: 'unregistered' },
  gstInvoiceOwner: { type: String, enum: ['admin', 'seller'], default: 'seller' },
  invoiceNote: { type: String, default: '', maxlength: 500 },
  voidedAt: Date,
  voidReason: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

// A multi-vendor order can produce one commission/courier invoice per seller.
// `vendor: null` keeps the sales invoice unique while commercial documents are
// unique per seller and revision.
invoiceSchema.index({ tenant: 1, order: 1, vendor: 1, documentType: 1, revision: 1 }, { unique: true });
invoiceSchema.index({ tenant: 1, createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
