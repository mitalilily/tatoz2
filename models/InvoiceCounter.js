const mongoose = require('mongoose');

const invoiceCounterSchema = new mongoose.Schema({
  scope: { type: String, required: true, unique: true, index: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  fiscalYear: { type: String, required: true },
  sequence: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('InvoiceCounter', invoiceCounterSchema);
