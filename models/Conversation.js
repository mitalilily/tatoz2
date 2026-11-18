const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category: {
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'escalated'],
    default: 'active',
    index: true,
  },
  messages: [messageSchema],
  escalation: {
    reason: String,
    createdAt: Date,
    adminNotes: String,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  creditsCost: { type: Number, default: 2 },
}, { timestamps: true });

conversationSchema.index({ user: 1, createdAt: -1 });
conversationSchema.index({ tenant: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
