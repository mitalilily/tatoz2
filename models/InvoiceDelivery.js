const mongoose = require('mongoose');

const invoiceDeliverySchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true },
  note: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceNote', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  channel: { type: String, enum: ['email', 'whatsapp'], required: true },
  provider: { type: String, enum: ['brevo', 'wati'], required: true },
  recipient: { type: String, required: true, select: false },
  recipientMasked: { type: String, default: '' },
  status: { type: String, enum: ['queued', 'processing', 'sent', 'delivered', 'failed', 'dead_letter'], default: 'queued', index: true },
  eventType: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  externalId: { type: String, default: '' },
  error: { type: String, default: '' },
  nextAttemptAt: Date,
  queuedAt: { type: Date, default: Date.now },
  sentAt: Date,
  deliveredAt: Date,
}, { timestamps: true });

invoiceDeliverySchema.index({ tenant: 1, idempotencyKey: 1 }, { unique: true });
invoiceDeliverySchema.index({ tenant: 1, createdAt: -1 });

module.exports = mongoose.model('InvoiceDelivery', invoiceDeliverySchema);
