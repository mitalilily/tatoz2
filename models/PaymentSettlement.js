const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema({
  paymentAttempt: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt', required: true },
  paymentTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction' },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  externalPaymentId: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  fees: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  netAmount: { type: Number, required: true, min: 0 },
}, { _id: false });

// A settlement is a provider-confirmed batch, not a derived synonym for a
// capture. The tenant-owned allocation list is the only payment-level data
// retained, so account-wide provider rows never leak into tenant APIs.
const paymentSettlementSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  provider: { type: String, required: true, lowercase: true, trim: true, index: true },
  externalSettlementId: { type: String, required: true, trim: true, maxlength: 200 },
  status: { type: String, enum: ['created', 'processed', 'failed', 'reversed'], default: 'created', index: true },
  amount: { type: Number, required: true, min: 0 },
  fees: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  netAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
  utr: { type: String, default: '', trim: true, maxlength: 200 },
  settlementAt: { type: Date, default: Date.now, index: true },
  allocations: { type: [allocationSchema], default: [] },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 160 },
  source: { type: String, enum: ['provider', 'admin', 'system'], required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

paymentSettlementSchema.index({ tenant: 1, provider: 1, externalSettlementId: 1 }, { unique: true });
paymentSettlementSchema.index({ tenant: 1, provider: 1, idempotencyKey: 1 }, { unique: true });
paymentSettlementSchema.index({ tenant: 1, provider: 1, settlementAt: -1 });

module.exports = mongoose.model('PaymentSettlement', paymentSettlementSchema);
