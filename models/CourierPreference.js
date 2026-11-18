const mongoose = require('mongoose');

const courierPreferenceSchema = new mongoose.Schema({
  courierCompanyId: { type: Number, required: true, unique: true, index: true },
  courierName: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  priority: { type: Number, default: 100 }, // lower = higher priority
  manuallyStressed: { type: Boolean, default: false },
  manualStressCleared: { type: Boolean, default: false },
  lastSeenAt: { type: Date, default: Date.now },
  metadata: {
    rating: Number,
    surface: Boolean,
    air: Boolean,
    realtimeTracking: String,
    raw: mongoose.Schema.Types.Mixed,
  },
}, { timestamps: true });

courierPreferenceSchema.index({ enabled: 1, priority: 1 });

module.exports = mongoose.model('CourierPreference', courierPreferenceSchema);
