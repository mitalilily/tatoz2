const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
  provider: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  // This is intentionally excluded from normal queries. The integration
  // service is the only code path that decrypts it for an outbound request.
  credentialsEncrypted: { type: String, required: true, select: false },
  lastTest: {
    status: { type: String, enum: ['untested', 'connected', 'failed'], default: 'untested' },
    message: { type: String, default: '' },
    testedAt: Date,
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

integrationSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Integration', integrationSchema);
