const mongoose = require('mongoose');

const pageBuilderCheckpointSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true, index: true },
  target: { type: String, enum: ['desktop', 'mobile'], default: 'desktop' },
  prompt: { type: String, default: '' },
  changes: { type: [String], default: [] },
  beforeLayout: { type: mongoose.Schema.Types.Mixed, required: true },
  beforeBuilderRevision: { type: Number, default: 0, min: 0 },
  afterFingerprint: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  usedAt: { type: Date, default: null },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, default: () => new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) },
}, { timestamps: true });

pageBuilderCheckpointSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
pageBuilderCheckpointSchema.index({ pageId: 1, createdAt: -1 });

module.exports = mongoose.model('PageBuilderCheckpoint', pageBuilderCheckpointSchema);
