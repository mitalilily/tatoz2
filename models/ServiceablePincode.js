const mongoose = require('mongoose');

const serviceablePincodeSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  pincode: { type: String, required: true, trim: true, match: /^\d{6}$/, index: true },
  city: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  country: { type: String, trim: true, default: 'India' },
  serviceable: { type: Boolean, default: true, index: true },
  codEnabled: { type: Boolean, default: true },
  shippingCharge: { type: Number, min: 0, default: 0 },
  estimatedMinDays: { type: Number, min: 0, max: 365, default: 3 },
  estimatedMaxDays: { type: Number, min: 0, max: 365, default: 7 },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

serviceablePincodeSchema.index({ tenant: 1, pincode: 1 }, { unique: true });

module.exports = mongoose.model('ServiceablePincode', serviceablePincodeSchema);
