const mongoose = require('mongoose');

const customerSubscriptionSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  quantity: { type: Number, default: 1, min: 1, max: 100000 },
  price: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending_payment', 'active', 'paused', 'cancelled', 'expired'], default: 'pending_payment', index: true },
  nextBillingAt: Date,
  paymentProvider: { type: String, default: '' },
  externalSubscriptionId: { type: String, default: '' },
  idempotencyKey: { type: String, required: true, trim: true },
  statusHistory: [{ status: String, note: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
}, { timestamps: true });

customerSubscriptionSchema.index({ tenant: 1, user: 1, idempotencyKey: 1 }, { unique: true });
customerSubscriptionSchema.index({ tenant: 1, status: 1, nextBillingAt: 1 });

module.exports = mongoose.model('CustomerSubscription', customerSubscriptionSchema);
