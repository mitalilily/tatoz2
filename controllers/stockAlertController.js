const asyncHandler = require('express-async-handler');
const StockAlert = require('../models/StockAlert');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const { sendEmail } = require('../services/emailService');
const { isChannelAllowed } = require('../services/notificationDeliveryService');
const { isUserInTenant } = require('../services/customerScopeService');
const Settings = require('../models/Settings');
const { addApprovedProductFilter } = require('../services/productApprovalService');

const tenantIdOf = req => req.tenant?._id || null;

const normalizedEmail = value => String(value || '').trim().toLowerCase();
const normalizedPhone = value => String(value || '').trim();

const alertIdentity = (req, { allowBodyEmail = false } = {}) => {
  const userId = req.user?._id || null;
  const email = normalizedEmail(req.user?.email || (allowBodyEmail ? req.body?.email : req.query?.email));
  const phone = normalizedPhone(req.user?.phone);
  return { userId, email, phone };
};

const alertLookup = ({ tenant, product, userId, email }) => ({
  tenant,
  product,
  $or: [
    ...(userId ? [{ user: userId }] : []),
    ...(email ? [{ email }] : []),
  ],
});

// @desc    Subscribe for stock alert
// @route   POST /api/products/:slug/stock-alert
const subscribeAlert = asyncHandler(async (req, res) => {
  const tenant = tenantIdOf(req);
  if (!tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const productQuery = { slug: req.params.slug, tenant };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('_id stock tenant');
  if (!product) { res.status(404); throw new Error('Product not found'); }

  if (product.stock > 0) { res.status(400); throw new Error('Product is already in stock'); }

  const { userId, email, phone } = alertIdentity(req, { allowBodyEmail: true });
  if (!email && !userId) { res.status(400); throw new Error('Email or a verified customer account is required'); }
  if (userId && !(await isUserInTenant({ tenant, userId }))) { res.status(403); throw new Error('Customer is not part of this store'); }
  if (!email && !phone) { res.status(400); throw new Error('Add an email or verified phone number to receive this alert'); }

  const lookup = alertLookup({ tenant, product: product._id, userId, email });
  const existing = await StockAlert.findOne(lookup);
  const alert = existing || new StockAlert({ tenant, product: product._id });
  alert.tenant = tenant;
  alert.product = product._id;
  alert.email = email;
  alert.phone = phone;
  alert.user = userId || undefined;
  alert.notified = false;
  alert.notifiedAt = null;
  alert.notification = null;
  alert.delivery = { inApp: false, email: false, emailSkipped: false };
  await alert.save();

  res.json({ success: true, message: userId && !email ? 'You will be notified in your account when this product is back in stock' : 'You will be notified when this product is back in stock' });
});

// @desc    Unsubscribe from stock alert
// @route   DELETE /api/products/:slug/stock-alert
const unsubscribeAlert = asyncHandler(async (req, res) => {
  const tenant = tenantIdOf(req);
  if (!tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const productQuery = { slug: req.params.slug, tenant };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('_id');
  if (!product) { res.status(404); throw new Error('Product not found'); }

  const { userId, email } = alertIdentity(req, { allowBodyEmail: true });
  if (!userId && !email) { res.status(400); throw new Error('Customer account or email is required'); }
  await StockAlert.deleteOne(alertLookup({ tenant, product: product._id, userId, email }));

  res.json({ success: true, message: 'Alert removed' });
});

// @desc    Check if user is subscribed to stock alert
// @route   GET /api/products/:slug/stock-alert
const checkAlert = asyncHandler(async (req, res) => {
  const tenant = tenantIdOf(req);
  if (!tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const productQuery = { slug: req.params.slug, tenant };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('_id');
  if (!product) return res.json({ success: true, subscribed: false });

  const { userId, email } = alertIdentity(req);
  if (!userId && !email) return res.json({ success: true, subscribed: false });

  const alert = await StockAlert.findOne({ ...alertLookup({ tenant, product: product._id, userId, email }), notified: false });
  res.json({ success: true, subscribed: !!alert });
});

// ─── Trigger function (called when stock is updated) ───────────

const triggerStockAlerts = async (productId) => {
  const productQuery = { _id: productId };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('title slug thumbnail stock tenant');
  if (!product || product.stock <= 0) return;

  // Product ids are globally unique, so legacy records without a tenant can
  // be safely upgraded in place while new records remain tenant-bound.
  const alerts = await StockAlert.find({
    product: productId,
    notified: false,
    $or: [{ tenant: product.tenant }, { tenant: { $exists: false } }],
  });
  if (alerts.length === 0) return;

  const siteName = await Settings.get('site_name', 'Our Store');
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  for (const alert of alerts) {
    try {
      const subject = `${product.title} is back in stock! — ${siteName}`;
      const html = `
          <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <h2 style="color:#111827;font-size:20px;">Good news! 🎉</h2>
            <p style="color:#6b7280;font-size:14px;">
              <strong>${product.title}</strong> is back in stock at <strong>${siteName}</strong>.
            </p>
            ${product.thumbnail ? `<img src="${product.thumbnail}" alt="${product.title}" style="width:200px;border-radius:12px;margin:16px 0;" />` : ''}
            <a href="${clientUrl}/product/${product.slug}" style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;margin-top:8px;">
              Shop Now
            </a>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px;">You received this because you requested a stock alert.</p>
          </div>
        `;

      let inApp = false;
      if (alert.user) {
        const inAppNotification = await Notification.findOneAndUpdate(
          { tenant: product.tenant, 'data.kind': 'back_in_stock', 'data.stockAlertId': String(alert._id) },
          {
            $setOnInsert: {
              tenant: product.tenant,
              title: `${product.title} is back in stock`,
              message: `${product.title} is available again.`,
              type: 'alert',
              target: 'specific',
              targetUsers: [alert.user],
              channels: { email: Boolean(alert.email), push: false, sms: false },
              sentAt: new Date(),
              status: 'sent',
              data: { kind: 'back_in_stock', stockAlertId: String(alert._id), productId: String(product._id), slug: product.slug, stock: Number(product.stock || 0) },
            },
          },
          { upsert: true, new: true },
        );
        alert.notification = inAppNotification._id;
        inApp = true;
      }

      const emailAllowed = Boolean(alert.email) && (!alert.user || await isChannelAllowed({ tenant: product.tenant, userId: alert.user, channel: 'email', purpose: 'transactional' }));
      if (emailAllowed) await sendEmail({ tenantId: product.tenant, to: alert.email, subject, html });
      alert.notified = true;
      alert.notifiedAt = new Date();
      alert.delivery = { inApp, email: emailAllowed, emailSkipped: Boolean(alert.email) && !emailAllowed };
      await alert.save();
    } catch (err) {
      console.error(`Failed to send stock alert to ${alert.email}:`, err.message);
    }
  }
};

module.exports = { subscribeAlert, unsubscribeAlert, checkAlert, triggerStockAlerts };
