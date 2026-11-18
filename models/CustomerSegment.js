const mongoose = require('mongoose');

const conditionSchema = new mongoose.Schema({
  field: { type: String, required: true },
  operator: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const customerSegmentSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 140 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  definition: {
    match: { type: String, enum: ['all', 'any'], default: 'all' },
    conditions: { type: [conditionSchema], default: [] },
  },
  isActive: { type: Boolean, default: true, index: true },
  memberCount: { type: Number, default: 0, min: 0 },
  lastEvaluatedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

customerSegmentSchema.index({ tenant: 1, slug: 1 }, { unique: true });
customerSegmentSchema.index({ tenant: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model('CustomerSegment', customerSegmentSchema);
