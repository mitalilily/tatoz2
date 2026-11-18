const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['customer', 'admin', 'system'], required: true },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  internal: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const supportTicketSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  ticketNumber: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, enum: ['general', 'order', 'payment', 'shipping', 'return', 'product', 'account'], default: 'general', index: true },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },
  status: { type: String, enum: ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'], default: 'open', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  tags: [{ type: String, trim: true, maxlength: 40 }],
  messages: { type: [ticketMessageSchema], default: [] },
  external: {
    provider: { type: String, default: '' },
    ticketId: { type: String, default: '' },
    syncStatus: { type: String, enum: ['not_configured', 'pending', 'synced', 'failed'], default: 'not_configured' },
    lastError: { type: String, default: '' },
    syncedAt: Date,
  },
  lastRespondedAt: { type: Date, default: Date.now, index: true },
  closedAt: Date,
}, { timestamps: true });

supportTicketSchema.index({ tenant: 1, status: 1, updatedAt: -1 });
supportTicketSchema.index({ tenant: 1, user: 1, createdAt: -1 });
supportTicketSchema.index({ tenant: 1, order: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
