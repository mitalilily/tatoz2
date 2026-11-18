const mongoose = require('mongoose');

const pageVersionSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true, index: true },
  layoutSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  mobileLayoutSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  // Complete published-document snapshot. The legacy layout fields remain
  // queryable for compatibility with existing version consumers.
  documentSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  publishedAt: { type: Date, default: Date.now },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  changeNote: { type: String, default: '' },
}, { timestamps: true });

pageVersionSchema.index({ pageId: 1, publishedAt: -1 });

module.exports = mongoose.model('PageVersion', pageVersionSchema);
