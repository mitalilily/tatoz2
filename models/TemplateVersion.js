const mongoose = require('mongoose');

const templateVersionSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true, index: true },
  version: { type: Number, required: true, min: 1 },
  layoutSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  mobileLayoutSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  mobileLayoutMode: { type: String, enum: ['auto', 'separate'], default: 'auto' },
  pageSettingsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  seoSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  changeNote: { type: String, default: '', trim: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

templateVersionSchema.index({ templateId: 1, version: 1 }, { unique: true });
templateVersionSchema.index({ templateId: 1, createdAt: -1 });

module.exports = mongoose.model('TemplateVersion', templateVersionSchema);
