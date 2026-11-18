const mongoose = require('mongoose');

const courierMetricsSchema = new mongoose.Schema({
  courierCompanyId: { type: Number, required: true, index: true },
  courierName: String,
  date: { type: Date, required: true }, // day bucket (midnight UTC)
  shipments: { type: Number, default: 0 },
  delivered: { type: Number, default: 0 },
  rto: { type: Number, default: 0 },
  ndr: { type: Number, default: 0 },
  pickupFailed: { type: Number, default: 0 },
}, { timestamps: true });

// Unique compound index — one bucket per courier per day
courierMetricsSchema.index({ courierCompanyId: 1, date: 1 }, { unique: true });

// Helper: bucket a date to UTC midnight
courierMetricsSchema.statics.dayBucket = (d = new Date()) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

module.exports = mongoose.model('CourierMetrics', courierMetricsSchema);
