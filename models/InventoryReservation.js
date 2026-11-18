const mongoose = require('mongoose');

const reservationItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  variant: { type: mongoose.Schema.Types.Mixed, default: {} },
  variantKey: { type: String, required: true },
  unitPrice: { type: Number, required: true, min: 0 },
  title: { type: String, default: '' },
  sku: { type: String, default: '' },
}, { _id: false });

const inventoryReservationSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: {
    type: String,
    enum: ['active', 'converted', 'released'],
    default: 'active',
    index: true,
  },
  items: { type: [reservationItemSchema], required: true, validate: value => Array.isArray(value) && value.length > 0 },
  expiresAt: { type: Date, required: true, index: true },
  convertedAt: Date,
  releasedAt: Date,
  releaseReason: { type: String, default: '' },
}, { timestamps: true });

inventoryReservationSchema.index({ tenant: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('InventoryReservation', inventoryReservationSchema);
