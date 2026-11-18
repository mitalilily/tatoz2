const mongoose = require('mongoose');

const vendorLedgerSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  type: {
    type: String,
    enum: ['sale_credit', 'commission_debit', 'refund_debit', 'payout_debit', 'adjustment_credit', 'adjustment_debit'],
    required: true,
  },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  reference: {
    subOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    payout: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout' },
  },
  note: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false } });

vendorLedgerSchema.index({ vendor: 1, createdAt: -1 });

module.exports = mongoose.model('VendorLedger', vendorLedgerSchema);
