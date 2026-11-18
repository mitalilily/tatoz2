const mongoose = require('mongoose');

const refundRequestSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  returnRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRequest', index: true },
  type: {
    type: String,
    enum: ['cancellation', 'return', 'partial', 'goodwill'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processed'],
    default: 'pending',
    index: true,
  },
  amount: { type: Number, required: true },
  approvedAmount: { type: Number },
  reason: { type: String, required: true },
  description: { type: String },
  images: [{ url: String, publicId: String }],
  adminNote: { type: String },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  razorpayRefundId: { type: String },
  processedAt: { type: Date },
}, { timestamps: true });

refundRequestSchema.index({ status: 1, createdAt: -1 });
refundRequestSchema.index({ tenant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RefundRequest', refundRequestSchema);
