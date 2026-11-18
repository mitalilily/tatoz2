const mongoose = require('mongoose');

const courierRuleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  priority: { type: Number, default: 100 }, // rule evaluation order, lower = earlier
  conditions: {
    weightMin: { type: Number, default: null }, // kg, null = unbounded
    weightMax: { type: Number, default: null },
  },
  action: {
    type: {
      type: String,
      enum: ['prefer', 'exclude'],
      required: true,
    },
    courierCompanyId: { type: Number, required: true },
    courierName: String,
  },
}, { timestamps: true });

courierRuleSchema.index({ enabled: 1, priority: 1 });

module.exports = mongoose.model('CourierRule', courierRuleSchema);
