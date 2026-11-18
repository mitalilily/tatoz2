const mongoose = require('mongoose');

/**
 * A settlement run groups one payout per vendor for a closing period.
 * Reruns for the same (tenant, periodStart, periodEnd) are idempotent:
 * the service reuses the existing run and only tops up vendors that have
 * no payout for that period yet.
 */
const settlementLineSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  payout: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null },
  grossEarnings: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  skippedReason: { type: String, default: '' },
}, { _id: false });

const settlementRunSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  status: { type: String, enum: ['completed'], default: 'completed' },
  lines: { type: [settlementLineSchema], default: [] },
  totals: {
    vendorsSettled: { type: Number, default: 0 },
    vendorsSkipped: { type: Number, default: 0 },
    grossEarnings: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false } });

settlementRunSchema.index({ tenant: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

module.exports = mongoose.model('SettlementRun', settlementRunSchema);
