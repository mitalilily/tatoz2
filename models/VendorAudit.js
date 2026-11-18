const mongoose = require('mongoose');

/**
 * Immutable audit trail for every seller lifecycle or money movement
 * initiated from the admin panel (approve / reject / request-changes /
 * suspend / reactivate / commission / verification / payout / settlement).
 * Append-only: controllers create rows, never update them.
 */
const vendorAuditSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: {
    type: String,
    required: true,
    enum: [
      'registered', 'documents_submitted', 'agreement_accepted', 'resubmitted',
      'approve', 'reject', 'request_changes', 'suspend', 'reactivate',
      'commission', 'settings', 'verification', 'reverify',
      'payout_process', 'payout_complete', 'payout_fail',
      'settlement_run', 'team_change',
    ],
  },
  reasonCode: { type: String, default: '' },
  note: { type: String, default: '', maxlength: 1000 },
  before: { type: mongoose.Schema.Types.Mixed, default: undefined },
  after: { type: mongoose.Schema.Types.Mixed, default: undefined },
}, { timestamps: { createdAt: true, updatedAt: false } });

vendorAuditSchema.index({ vendor: 1, createdAt: -1 });

module.exports = mongoose.model('VendorAudit', vendorAuditSchema);
