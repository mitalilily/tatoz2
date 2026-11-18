const nodemailer = require('nodemailer');
const { getProviderConfig } = require('./integrationService');
const tenantIntegrationService = require('./tenantIntegrationService');
const { PLATFORM_NAME } = require('../constants/branding');

let transporter = null;
let transporterSignature = '';

const getTransporter = config => {
  const signature = [config.host, config.port, config.secure, config.user, config.pass].join('|');
  if (!transporter || transporterSignature !== signature) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port) || 587,
      secure: Boolean(config.secure),
      auth: { user: config.user, pass: config.pass },
    });
    transporterSignature = signature;
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const config = await getProviderConfig('smtp');
  if (!config.enabled || !config.user || !config.pass || !config.host) {
    console.log(`Email skipped (not configured): ${subject} to ${to}`);
    return;
  }
  try {
    await getTransporter(config).sendMail({
      from: config.from || config.user,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
  } catch (err) {
    console.error('Email error:', err.message);
  }
};

const sendVerificationOtp = async ({ tenantId, to, otp }) => {
  const config = await tenantIntegrationService.configFor(tenantId, 'smtp', { allowPlatformFallback: true });
  if (!config.enabled || !config.user || !config.pass || !config.host || !config.from) {
    const error = new Error('Email verification is not configured');
    error.statusCode = 503;
    error.publicCode = 'OTP_PROVIDER_UNAVAILABLE';
    throw error;
  }
  await getTransporter(config).sendMail({
    from: config.from || config.user,
    to,
    subject: `Your ${PLATFORM_NAME} cart verification code`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2>Verify your cart</h2><p>Use this one-time code to continue:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${String(otp)}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
    text: `Your ${PLATFORM_NAME} cart verification code is ${String(otp)}. It expires in 10 minutes.`,
  });
  return { status: 'sent' };
};

const sendOrderConfirmation = async (order, user) => {
  await sendEmail({
    to: user.email,
    subject: `Order Confirmed - #${order.orderNumber} | ${PLATFORM_NAME}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Order Confirmed! 🎉</h2>
        <p>Hi ${user.name}, your order has been placed successfully.</p>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p><strong>Total Amount:</strong> ₹${order.total.toFixed(2)}</p>
          <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
          <p><strong>Estimated Delivery:</strong> 3-7 business days</p>
        </div>
        <p>Thank you for shopping with <strong>${PLATFORM_NAME}</strong>!</p>
      </div>
    `,
  });
};

const sendPasswordReset = async (user, resetUrl) => {
  await sendEmail({
    to: user.email,
    subject: `Password Reset - ${PLATFORM_NAME}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Reset Your Password</h2>
        <p>Hi ${user.name},</p>
        <p>You requested a password reset. Click below (valid for 10 minutes):</p>
        <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0;">Reset Password</a>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `,
  });
};

const sendWelcome = async (user) => {
  await sendEmail({
    to: user.email,
    subject: `Welcome to ${PLATFORM_NAME}!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Welcome to ${PLATFORM_NAME}! 🛍️</h2>
        <p>Hi ${user.name}, welcome to ${PLATFORM_NAME} - your AI-powered shopping destination.</p>
        <p>Start exploring thousands of products with personalized recommendations!</p>
      </div>
    `,
  });
};

module.exports = { sendEmail, sendVerificationOtp, sendOrderConfirmation, sendPasswordReset, sendWelcome };
