const mongoose = require('mongoose');

const decisionPathEntrySchema = new mongoose.Schema({
  courierCompanyId: Number,
  courierName: String,
  excludedReason: {
    type: String,
    enum: ['disabled', 'stressed', 'rule-exclude', 'priority-loser', null],
    default: null,
  },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourierRule' },
  rank: Number, // final rank among candidates (1 = chosen)
}, { _id: false });

const courierActivityLogSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  orderNumber: String,
  chosenCourierCompanyId: Number,
  chosenCourierName: String,
  triggeredBy: {
    type: String,
    enum: ['auto-order-create', 'bulk-run', 'manual', 'dry-run'],
    required: true,
  },
  matchedRuleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CourierRule' }],
  decisionPath: [decisionPathEntrySchema],
  outcome: {
    type: String,
    enum: ['assigned', 'no-candidate', 'shiprocket-error', 'locked', 'dry-run'],
    required: true,
  },
  errorMessage: String,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
    expires: 60 * 60 * 24 * 90, // TTL 90 days
  },
});

courierActivityLogSchema.index({ chosenCourierCompanyId: 1, createdAt: -1 });
courierActivityLogSchema.index({ outcome: 1, createdAt: -1 });

module.exports = mongoose.model('CourierActivityLog', courierActivityLogSchema);
