const mongoose = require('mongoose');

const userNotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  dismissed: { type: Boolean, default: false },
}, { timestamps: true });

userNotificationSchema.index({ user: 1, createdAt: -1 });
userNotificationSchema.index({ user: 1, isRead: 1 });
userNotificationSchema.index({ user: 1, notification: 1 }, { unique: true });

module.exports = mongoose.model('UserNotification', userNotificationSchema);
