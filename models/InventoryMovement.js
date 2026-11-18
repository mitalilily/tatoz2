const mongoose = require('mongoose');

const inventoryMovementSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryReservation', index: true },
  type: {
    type: String,
    enum: ['reserve', 'convert', 'release', 'sale', 'restock', 'adjustment'],
    required: true,
    index: true,
  },
  quantity: { type: Number, required: true, min: 1 },
  variant: { type: mongoose.Schema.Types.Mixed, default: {} },
  variantKey: { type: String, default: '' },
  availableBefore: { type: Number, required: true, min: 0 },
  availableAfter: { type: Number, required: true, min: 0 },
  reservedBefore: { type: Number, required: true, min: 0 },
  reservedAfter: { type: Number, required: true, min: 0 },
  soldBefore: { type: Number, required: true, min: 0 },
  soldAfter: { type: Number, required: true, min: 0 },
  reason: { type: String, default: '' },
  idempotencyKey: { type: String, required: true, unique: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

inventoryMovementSchema.index({ tenant: 1, product: 1, createdAt: -1 });
inventoryMovementSchema.index({ tenant: 1, order: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
