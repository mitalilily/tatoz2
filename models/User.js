const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  country: { type: String, default: 'India' },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/, 'Invalid email'],
  },
  phone: { type: String, trim: true },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,
  },
  googleId: { type: String, index: true },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['customer', 'vendor', 'staff', 'admin', 'superadmin', 'affiliate'], default: 'customer' },
  addresses: [addressSchema],
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  isPhoneVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  twoFactorPendingSecret: { type: String, select: false },
  notificationPrefs: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
  },
  language: { type: String, default: 'en' },
  darkMode: { type: Boolean, default: false },
  // Affiliate specific fields
  affiliateCode: { type: String, unique: true, sparse: true },
  commissionRate: { type: Number, default: 0 },
  walletBalance: { type: Number, default: 0 },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  lastLogin: Date,
  loginHistory: [{ ip: String, device: String, at: Date }],
  // Segmentation
  tags: [{ type: String, trim: true }],
  segment: { type: String, enum: ['new', 'active', 'vip', 'at_risk', 'dormant'], default: 'new' },
  totalSpent: { type: Number, default: 0 },
  orderCount: { type: Number, default: 0 },
  lastOrderAt: Date,
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.index({ role: 1 });
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
);

module.exports = mongoose.model('User', userSchema);
