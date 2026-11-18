const mongoose = require('mongoose');

const customerSegmentMembershipSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  segment: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSegment', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

customerSegmentMembershipSchema.index({ tenant: 1, segment: 1, user: 1 }, { unique: true });
customerSegmentMembershipSchema.index({ tenant: 1, user: 1, updatedAt: -1 });

module.exports = mongoose.model('CustomerSegmentMembership', customerSegmentMembershipSchema);
