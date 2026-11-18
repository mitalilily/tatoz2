const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const { authLimiter } = require('../middleware/rateLimiter');
const { requireTurnstile } = require('../middleware/turnstile');
const {
  getOtpReadiness, sendOtp, verifyOtp, resendOtp, adminLogin, logout, getMe,
  updateProfile, addAddress, toggleWishlist, googleAuth, googleConfig, getCsrfToken,
  changePhoneSendOtp, changePhoneVerify, getAuthConfig, register, passwordLogin,
} = require('../controllers/authController');

// Only tenant-aware customer auth providers need host/membership resolution.
// Keep CSRF and admin-login bootstrap endpoints independent of Mongo tenant
// discovery so liveness/security probes remain fast when Mongo is unavailable.
router.use(['/config', '/otp-readiness', '/send-otp', '/verify-otp', '/resend-otp', '/google-config', '/google', '/register', '/login', '/change-phone', '/me', '/wishlist'], loadTenantOptional);

router.get('/config', getAuthConfig);
// Customer auth (phone + OTP)
router.get('/otp-readiness', getOtpReadiness);
router.post('/send-otp', authLimiter, requireTurnstile, optionalAuth, sendOtp);
router.post('/verify-otp', authLimiter, requireTurnstile, optionalAuth, verifyOtp);
router.post('/resend-otp', authLimiter, requireTurnstile, optionalAuth, resendOtp);
router.post('/register', authLimiter, requireTurnstile, register);
router.post('/login', authLimiter, requireTurnstile, passwordLogin);

// Google OAuth
router.get('/google-config', googleConfig);
router.post('/google', authLimiter, googleAuth);

// Admin auth (email + password)
router.post('/admin/login', authLimiter, requireTurnstile, adminLogin);

// Common
router.post('/logout', optionalAuth, logout);
router.get('/csrf', getCsrfToken);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/change-phone/send-otp', protect, authLimiter, changePhoneSendOtp);
router.post('/change-phone/verify', protect, authLimiter, changePhoneVerify);
router.post('/addresses', protect, addAddress);
router.post('/wishlist/:productId', protect, toggleWishlist);

module.exports = router;
