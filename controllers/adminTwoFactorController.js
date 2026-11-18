const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const totpService = require('../services/totpService');

const getStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+twoFactorSecret');
  res.json({ success: true, enabled: Boolean(user?.twoFactorEnabled && user?.twoFactorSecret) });
});

const setup = asyncHandler(async (req, res) => {
  const secret = totpService.generateSecret();
  await User.findByIdAndUpdate(req.user._id, { $set: { twoFactorPendingSecret: secret } });
  res.json({ success: true, secret, otpauthUrl: totpService.otpauthUrl({ secret, account: req.user.email }) });
});

const enable = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+twoFactorPendingSecret');
  if (!user?.twoFactorPendingSecret || !totpService.verifyCode(user.twoFactorPendingSecret, req.body?.code)) { res.status(400); throw new Error('Invalid authenticator code'); }
  user.twoFactorSecret = user.twoFactorPendingSecret;
  user.twoFactorPendingSecret = undefined;
  user.twoFactorEnabled = true;
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, enabled: true });
});

const disable = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+twoFactorSecret');
  if (!user?.twoFactorEnabled || !totpService.verifyCode(user.twoFactorSecret, req.body?.code)) { res.status(400); throw new Error('Invalid authenticator code'); }
  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  user.twoFactorPendingSecret = undefined;
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, enabled: false });
});

module.exports = { getStatus, setup, enable, disable };
