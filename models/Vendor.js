const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  fullName: String,
  phone: String,
  street: String,
  city: String,
  state: String,
  pincode: String,
  country: { type: String, default: 'India' },
});

const vendorSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Tenant is optional during the online migration. New writes should always
  // set it; the nullable field keeps old vendor records readable until the
  // migration script has backfilled every record.
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  storeName: { type: String, required: [true, 'Store name is required'], unique: true, trim: true },
  slug: { type: String, required: [true, 'Slug is required'], unique: true, lowercase: true },
  logo: { type: String, default: '' },
  banner: { type: String, default: '' },
  description: { type: String, default: '' },
  contactEmail: { type: String, required: false, default: '', lowercase: true, trim: true, match: [/^$|^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/, 'Invalid email'] },
  contactPhone: { type: String, default: '', trim: true },
  address: addressSchema,
  socialLinks: {
    website: String,
    facebook: String,
    instagram: String,
    youtube: String,
    twitter: String,
  },
  businessDetails: {
    legalName: String,
    gstNumber: String,
    panNumber: String,
    registrationNumber: String,
    businessType: { type: String, enum: ['individual', 'partnership', 'llp', 'pvt_ltd', 'public_ltd', 'other'] },
    gstRegistrationType: { type: String, enum: ['unregistered', 'gstin'], default: 'unregistered' },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    requiresFssai: { type: Boolean, default: false },
  },
  // Vendor-owned tax identity and invoice configuration. This is deliberately
  // separate from the platform tenant TaxProfile so each seller's invoices
  // retain the seller GSTIN, state and numbering policy.
  taxProfile: {
    enabled: { type: Boolean, default: true },
    registrationType: { type: String, enum: ['unregistered', 'gstin'], default: 'unregistered' },
    pricingMode: { type: String, enum: ['exclusive', 'inclusive'], default: 'exclusive' },
    defaultRate: { type: Number, min: 0, max: 100, default: 18 },
    originState: { type: String, trim: true, maxlength: 100, default: '' },
    sellerGstin: { type: String, trim: true, uppercase: true, maxlength: 30, default: '' },
    gstLockedAt: { type: Date, default: null },
    businessName: { type: String, trim: true, maxlength: 200, default: '' },
    businessAddress: { type: mongoose.Schema.Types.Mixed, default: {} },
    invoicePrefix: { type: String, trim: true, uppercase: true, maxlength: 20, default: 'VINV' },
    shippingTaxable: { type: Boolean, default: false },
    invoiceNote: { type: String, trim: true, maxlength: 500, default: '' },
    gstComponents: {
      cgst: { type: Boolean, default: true },
      sgst: { type: Boolean, default: true },
      igst: { type: Boolean, default: true },
      utgst: { type: Boolean, default: true },
      cess: { type: Boolean, default: false },
    },
  },
  bankDetails: {
    accountHolderName: String,
    accountNumber: { type: String, select: false },
    ifscCode: { type: String, select: false },
    bankName: String,
    upiId: { type: String, select: false },
  },
  commissionRate: { type: Number, default: 0, min: 0, max: 100 },
  walletBalance: { type: Number, default: 0 },
  // Optional workspace-scoped AI balance. Null keeps legacy platform billing
  // behavior until a vendor is explicitly provisioned with its own quota.
  aiCredits: { type: Number, default: null, min: 0 },
  pendingPayout: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'active', 'suspended', 'rejected'], default: 'pending' },
  // Onboarding case state mirrors `status` but carries the review workflow
  // (reason codes, SLA clock, risk tier, completion checklist) without
  // renaming the legacy status enum that existing code depends on.
  onboarding: {
    state: { type: String, enum: ['draft', 'pending', 'changes_requested', 'approved', 'rejected', 'suspended'], default: 'pending' },
    reasonCode: { type: String, default: '' },
    reasonNote: { type: String, default: '', maxlength: 1000 },
    slaDueAt: { type: Date, default: null },
    riskTier: { type: String, enum: ['standard', 'fasttrack', 'edd'], default: 'standard' },
    checklist: {
      profile: { type: Boolean, default: false },
      bank: { type: Boolean, default: false },
      tax: { type: Boolean, default: false },
      docs: { type: Boolean, default: false },
      agreement: { type: Boolean, default: false },
    },
  },
  // Signed seller agreements (template version + acceptance proof).
  agreements: [{
    templateVersion: { type: String, default: 'v1.0' },
    signedAt: { type: Date, default: Date.now },
    ip: { type: String, default: '' },
    _id: false,
  }],
  adminNote: { type: String, default: '' },
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: Date,
  rejectionReason: String,
  settings: {
    minPayoutThreshold: { type: Number, default: 1000 },
    autoPayout: { type: Boolean, default: false },
    notifyOnNewOrder: { type: Boolean, default: true },
  },
  // Features are explicit so the platform can gradually enable advanced
  // modules per vendor without trusting values coming from the browser.
  features: {
    catalog: { type: Boolean, default: true },
    orders: { type: Boolean, default: true },
    inventory: { type: Boolean, default: true },
    payouts: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    seo: { type: Boolean, default: true },
    pageBuilder: { type: Boolean, default: true },
    customStorefront: { type: Boolean, default: true },
    coupons: { type: Boolean, default: false },
    customDomain: { type: Boolean, default: false },
    commissions: { type: Boolean, default: true },
    reports: { type: Boolean, default: true },
    reviews: { type: Boolean, default: true },
    subscriptions: { type: Boolean, default: true },
  },
  verification: {
    status: { type: String, enum: ['pending', 'under_review', 'verified', 'rejected'], default: 'pending' },
    submittedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String, default: '' },
    lastRecheckAt: { type: Date, default: null },
    // Each slot keeps the legacy plain-URL string shape readable AND the
    // new KYC metadata. String values are still accepted on write and are
    // normalized to { url } so old records keep working.
    documents: {
      gstCertificate: { type: mongoose.Schema.Types.Mixed, default: '' },
      panCard: { type: mongoose.Schema.Types.Mixed, default: '' },
      businessProof: { type: mongoose.Schema.Types.Mixed, default: '' },
      bankProof: { type: mongoose.Schema.Types.Mixed, default: '' },
      fssaiCertificate: { type: mongoose.Schema.Types.Mixed, default: '' },
    },
  },
  storefront: {
    tagline: { type: String, default: '' },
    announcement: { type: String, default: '' },
    theme: {
      primaryColor: { type: String, default: '#4f46e5' },
      accentColor: { type: String, default: '#111827' },
      surfaceColor: { type: String, default: '#f8fafc' },
      cardStyle: { type: String, enum: ['soft', 'bordered', 'flat'], default: 'soft' },
    },
    homepagePage: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', default: null },
    navigation: [{
      label: { type: String, trim: true },
      path: { type: String, trim: true },
      page: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', default: null },
    }],
    policies: {
      shipping: { type: String, default: '' },
      returns: { type: String, default: '' },
      privacy: { type: String, default: '' },
      terms: { type: String, default: '' },
    },
    seo: {
      metaTitle: { type: String, default: '' },
      metaDescription: { type: String, default: '' },
      canonical: { type: String, default: '' },
      ogImage: { type: String, default: '' },
      robots: { type: String, default: 'index, follow' },
    },
  },
  stats: {
    totalProducts: { type: Number, default: 0 },
    activeProducts: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    ratingsCount: { type: Number, default: 0 },
  },
}, { timestamps: true });

vendorSchema.index({ status: 1 });
vendorSchema.index({ tenant: 1, status: 1 });

// Sellers cannot mutate GST identity after registration. An admin GST-change
// endpoint sets this request-local escape hatch only after an explicit review.
vendorSchema.pre('save', async function lockSellerGst(next) {
  if (!this.isNew && !this.$locals.allowGstChange) {
    const previous = this.$locals.previousGstSnapshot || await this.constructor.findById(this._id)
      .select('businessDetails.gstNumber taxProfile.sellerGstin')
      .lean() || {};
    const nextGst = this.businessDetails?.gstNumber || '';
    const nextSellerGstin = this.taxProfile?.sellerGstin || '';
    if (this.isModified('businessDetails.gstNumber') && previous.gstNumber !== undefined && String(previous.gstNumber || '') !== String(nextGst)) {
      return next(new Error('GST changes require admin approval'));
    }
    if (this.isModified('taxProfile.sellerGstin') && previous.sellerGstin !== undefined && String(previous.sellerGstin || '') !== String(nextSellerGstin)) {
      return next(new Error('GST changes require admin approval'));
    }
  }
  return next();
});

module.exports = mongoose.model('Vendor', vendorSchema);
