const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  line1: { type: String, default: '', trim: true, maxlength: 160 },
  line2: { type: String, default: '', trim: true, maxlength: 160 },
  city: { type: String, default: '', trim: true, maxlength: 80 },
  state: { type: String, default: '', trim: true, maxlength: 80 },
  pincode: { type: String, default: '', trim: true, maxlength: 12 },
  country: { type: String, default: 'India', trim: true, maxlength: 80 },
}, { _id: false });

const warehouseSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  address: { type: addressSchema, default: () => ({}) },
  priority: { type: Number, default: 0, min: 0, max: 10000 },
  isActive: { type: Boolean, default: true, index: true },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

warehouseSchema.index({ tenant: 1, code: 1 }, { unique: true });
warehouseSchema.index({ tenant: 1, isActive: 1, priority: -1 });

module.exports = mongoose.model('Warehouse', warehouseSchema);
