const mongoose = require('mongoose');

const shipmentEventSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  shipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  provider: { type: String, required: true, lowercase: true, index: true },
  eventKey: { type: String, required: true, trim: true, maxlength: 180 },
  providerEventId: { type: String, trim: true, maxlength: 180 },
  status: { type: String, enum: ['creating', 'created', 'pickup_scheduled', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'rto', 'cancelled', 'returned', 'failed'], required: true, index: true },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  location: { type: String, trim: true, maxlength: 180, default: '' },
  eventAt: { type: Date, default: Date.now, index: true },
  source: { type: String, enum: ['system', 'provider', 'webhook', 'manual'], default: 'system', index: true },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

shipmentEventSchema.index({ tenant: 1, shipment: 1, eventKey: 1 }, { unique: true });
shipmentEventSchema.index({ tenant: 1, shipment: 1, eventAt: -1 });

module.exports = mongoose.model('ShipmentEvent', shipmentEventSchema);
