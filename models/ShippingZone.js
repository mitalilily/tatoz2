const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  countries: { type: [String], default: [] },
  states: { type: [String], default: [] },
  cities: { type: [String], default: [] },
  pincodes: { type: [String], default: [] },
  pincodePrefixes: { type: [String], default: [] },
  blockedPincodes: { type: [String], default: [] },
}, { _id: false });

const shippingZoneSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  enabled: { type: Boolean, default: true, index: true },
  priority: { type: Number, default: 0, min: 0, max: 10000 },
  match: { type: matchSchema, default: () => ({}) },
}, { timestamps: true });

shippingZoneSchema.index({ tenant: 1, code: 1 }, { unique: true });
shippingZoneSchema.index({ tenant: 1, enabled: 1, priority: -1 });

module.exports = mongoose.model('ShippingZone', shippingZoneSchema);
