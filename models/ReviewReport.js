const mongoose = require('mongoose');

const reviewReportSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reason: { type: String, required: true, trim: true, maxlength: 120 },
  details: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'reviewed', 'dismissed', 'actioned'], default: 'open', index: true },
  resolutionNote: { type: String, trim: true, maxlength: 500 },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
}, { timestamps: true });

reviewReportSchema.index({ tenant: 1, review: 1, reporter: 1 }, { unique: true });
reviewReportSchema.index({ tenant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ReviewReport', reviewReportSchema);
