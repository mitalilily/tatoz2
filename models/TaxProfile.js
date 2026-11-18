const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  line1: { type: String, default: '', trim: true, maxlength: 200 },
  line2: { type: String, default: '', trim: true, maxlength: 200 },
  city: { type: String, default: '', trim: true, maxlength: 100 },
  state: { type: String, default: '', trim: true, maxlength: 100 },
  pincode: { type: String, default: '', trim: true, maxlength: 20 },
  country: { type: String, default: 'India', trim: true, maxlength: 80 },
}, { _id: false });

const taxProfileSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  enabled: { type: Boolean, default: true },
  registrationType: { type: String, enum: ['unregistered', 'gstin'], default: 'unregistered' },
  pricingMode: { type: String, enum: ['exclusive', 'inclusive'], default: 'exclusive' },
  defaultRate: { type: Number, min: 0, max: 100, default: 18 },
  originState: { type: String, default: '', trim: true, maxlength: 100 },
  sellerGstin: { type: String, default: '', trim: true, uppercase: true, maxlength: 30 },
  // Policy is snapshotted onto each order: seller keeps its own GST identity,
  // while the tenant administrator decides which identity is printed on the
  // customer invoice.
  gstInvoiceOwner: { type: String, enum: ['admin', 'seller'], default: 'seller' },
  businessName: { type: String, default: '', trim: true, maxlength: 200 },
  businessAddress: { type: addressSchema, default: () => ({}) },
  invoicePrefix: { type: String, default: 'INV', trim: true, uppercase: true, maxlength: 20 },
  shippingTaxable: { type: Boolean, default: false },
  invoiceNote: { type: String, default: '', trim: true, maxlength: 500 },
  gstComponents: {
    cgst: { type: Boolean, default: true },
    sgst: { type: Boolean, default: true },
    igst: { type: Boolean, default: true },
    utgst: { type: Boolean, default: true },
    cess: { type: Boolean, default: false },
  },
}, { timestamps: true });

taxProfileSchema.index({ tenant: 1 }, { unique: true });

module.exports = mongoose.model('TaxProfile', taxProfileSchema);
