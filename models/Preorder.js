const mongoose = require('mongoose');

const preorderSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  kind: { type: String, enum: ['preorder', 'backorder'], required: true },
  quantity: { type: Number, required: true, min: 1, max: 100000 },
  unitPrice: { type: Number, required: true, min: 0 },
  depositAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['pending_payment', 'confirmed', 'fulfilled', 'cancelled', 'refunded'], default: 'pending_payment', index: true },
  estimatedShipDate: Date,
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  idempotencyKey: { type: String, required: true, trim: true },
  customerNote: { type: String, default: '', maxlength: 500 },
  statusHistory: [{ status: String, note: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
}, { timestamps: true });

preorderSchema.index({ tenant: 1, user: 1, idempotencyKey: 1 }, { unique: true });
preorderSchema.index({ tenant: 1, product: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Preorder', preorderSchema);
