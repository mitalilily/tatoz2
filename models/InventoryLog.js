const mongoose = require('mongoose');

const inventoryLogSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['restock', 'adjustment', 'bulk_update'], required: true },
  previousStock: { type: Number, required: true, min: 0 },
  newStock: { type: Number, required: true, min: 0 },
  delta: { type: Number, required: true },
  note: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });

inventoryLogSchema.index({ vendor: 1, createdAt: -1 });
inventoryLogSchema.index({ vendor: 1, product: 1 });
inventoryLogSchema.index({ tenant: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryLog', inventoryLogSchema);
