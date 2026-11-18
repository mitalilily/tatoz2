const mongoose = require('mongoose');

const transferItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  skuSnapshot: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const stockTransferSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  transferNumber: { type: String, required: true, trim: true },
  fromWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  toWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  items: { type: [transferItemSchema], required: true, validate: value => Array.isArray(value) && value.length > 0 },
  status: { type: String, enum: ['requested', 'in_transit', 'completed', 'cancelled'], default: 'requested', index: true },
  idempotencyKey: { type: String, required: true, trim: true },
  note: { type: String, default: '', maxlength: 500 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dispatchedAt: Date,
  receivedAt: Date,
}, { timestamps: true });

stockTransferSchema.index({ tenant: 1, transferNumber: 1 }, { unique: true });
stockTransferSchema.index({ tenant: 1, idempotencyKey: 1 }, { unique: true });
stockTransferSchema.index({ tenant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('StockTransfer', stockTransferSchema);
