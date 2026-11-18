const mongoose = require('mongoose');

// Append-only audit record for bounded admin changes to an order. This is
// deliberately separate from Order.statusHistory: a status transition and a
// commercial/address edit are different business events and need independent
// idempotency/audit semantics.
const orderAdjustmentSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  idempotencyKey: { type: String, required: true, trim: true, minlength: 8, maxlength: 128 },
  type: { type: String, enum: ['details', 'items'], required: true, default: 'details' },
  changes: { type: mongoose.Schema.Types.Mixed, default: {} },
  before: { type: mongoose.Schema.Types.Mixed, default: {} },
  after: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

orderAdjustmentSchema.index(
  { tenant: 1, order: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
orderAdjustmentSchema.index({ tenant: 1, createdAt: -1 });

module.exports = mongoose.model('OrderAdjustment', orderAdjustmentSchema);
