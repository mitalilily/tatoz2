const mongoose = require('mongoose');

const warehouseInventorySchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  skuSnapshot: { type: String, default: '' },
  quantity: { type: Number, default: 0, min: 0 },
  reservedQuantity: { type: Number, default: 0, min: 0 },
  incomingQuantity: { type: Number, default: 0, min: 0 },
  soldQuantity: { type: Number, default: 0, min: 0 },
  reorderLevel: { type: Number, default: 0, min: 0 },
  lastCountedAt: Date,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

warehouseInventorySchema.virtual('availableQuantity').get(function availableQuantity() {
  return Math.max(0, Number(this.quantity || 0) - Number(this.reservedQuantity || 0));
});

warehouseInventorySchema.set('toJSON', { virtuals: true });
warehouseInventorySchema.set('toObject', { virtuals: true });
warehouseInventorySchema.index({ tenant: 1, warehouse: 1, product: 1 }, { unique: true });
warehouseInventorySchema.index({ tenant: 1, product: 1, warehouse: 1 });

module.exports = mongoose.model('WarehouseInventory', warehouseInventorySchema);
