const mongoose = require('mongoose');

// Reusable Page Builder sections. The payload is validated by the controller
// against the canonical section validators before it reaches this flexible
// field, so new section settings can be added without a migration.
const pageBlockSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  scope: { type: String, enum: ['platform', 'vendor'], default: 'platform', index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null, index: true },
  sections: { type: mongoose.Schema.Types.Mixed, required: true },
  sectionCount: { type: Number, required: true, min: 1, max: 12 },
  sourcePageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  archivedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

pageBlockSchema.index({ scope: 1, vendor: 1, archivedAt: 1, updatedAt: -1 });

module.exports = mongoose.model('PageBlock', pageBlockSchema);
