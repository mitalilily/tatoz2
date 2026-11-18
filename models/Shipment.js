const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  provider: { type: String, required: true, lowercase: true, index: true },
  idempotencyKey: { type: String, required: true },
  status: { type: String, enum: ['creating', 'created', 'pickup_scheduled', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'rto', 'cancelled', 'returned', 'failed'], default: 'creating', index: true },
  externalOrderId: String,
  externalShipmentId: String,
  trackingNumber: String,
  courierName: String,
  rates: { type: mongoose.Schema.Types.Mixed, default: [] },
  tracking: { type: mongoose.Schema.Types.Mixed, default: {} },
  trackingUrl: String,
  lastEventAt: Date,
  lastSyncedAt: Date,
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

shipmentSchema.index({ order: 1, provider: 1 }, { unique: true });
shipmentSchema.index({ tenant: 1, status: 1, updatedAt: -1 });
shipmentSchema.index({ provider: 1, trackingNumber: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);
