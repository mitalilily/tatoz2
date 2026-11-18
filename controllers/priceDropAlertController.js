const asyncHandler = require('express-async-handler');
const PriceDropAlert = require('../models/PriceDropAlert');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const { sendEmail } = require('../services/emailService');
const { addApprovedProductFilter } = require('../services/productApprovalService');

const tenantIdOf = req => req.tenant?._id || null;

const productForRequest = async req => {
  if (!tenantIdOf(req)) return null;
  const query = { slug: req.params.slug, tenant: tenantIdOf(req), isActive: true };
  addApprovedProductFilter(query);
  return Product.findOne(query)
    .select('_id title slug price thumbnail tenant')
    .lean();
};

const assertCustomer = (req, res) => {
  if (req.user?.role === 'customer') return;
  res.status(403);
  throw new Error('Customer account required');
};

const normalizeTarget = (value, currentPrice, res) => {
  if (value === undefined || value === null || value === '') return null;
  const target = Number(value);
  if (!Number.isFinite(target) || target < 0 || target >= currentPrice) {
    res.status(400);
    throw new Error('Target price must be a valid amount below the current price');
  }
  return target;
};

const checkAlert = asyncHandler(async (req, res) => {
  assertCustomer(req, res);
  const product = await productForRequest(req);
  if (!product) { res.status(404); throw new Error('Product not found'); }
  const alert = await PriceDropAlert.findOne({ tenant: tenantIdOf(req), user: req.user._id, product: product._id, status: 'active' })
    .select('baselinePrice targetPrice currentPrice status createdAt')
    .lean();
  res.json({ success: true, subscribed: Boolean(alert), alert: alert || null });
});

const subscribeAlert = asyncHandler(async (req, res) => {
  assertCustomer(req, res);
  const product = await productForRequest(req);
  if (!product) { res.status(404); throw new Error('Product not found'); }
  const currentPrice = Number(product.price || 0);
  const targetPrice = normalizeTarget(req.body?.targetPrice, currentPrice, res);
  const now = new Date();
  const alert = await PriceDropAlert.findOneAndUpdate(
    { tenant: tenantIdOf(req), user: req.user._id, product: product._id },
    {
      $set: {
        email: String(req.user.email || '').toLowerCase(),
        phone: String(req.user.phone || ''),
        baselinePrice: currentPrice,
        currentPrice,
        targetPrice,
        status: 'active',
        lastEvaluatedPrice: currentPrice,
        notifiedAt: null,
        updatedAt: now,
      },
      $setOnInsert: { tenant: tenantIdOf(req), user: req.user._id, product: product._id, createdAt: now },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, subscribed: true, alert: { baselinePrice: alert.baselinePrice, targetPrice: alert.targetPrice ?? null, currentPrice: alert.currentPrice, status: alert.status } });
});

const unsubscribeAlert = asyncHandler(async (req, res) => {
  assertCustomer(req, res);
  const product = await productForRequest(req);
  if (!product) { res.status(404); throw new Error('Product not found'); }
  await PriceDropAlert.deleteOne({ tenant: tenantIdOf(req), user: req.user._id, product: product._id });
  res.json({ success: true, subscribed: false });
});

const triggerPriceDropAlerts = async (productId, { tenantId, previousPrice, currentPrice } = {}) => {
  if (!tenantId || !Number.isFinite(Number(currentPrice)) || !Number.isFinite(Number(previousPrice)) || Number(currentPrice) >= Number(previousPrice)) return { matched: 0, notified: 0 };
  const query = { _id: productId, tenant: tenantId, isActive: true };
  addApprovedProductFilter(query);
  const product = await Product.findOne(query).select('title slug thumbnail price tenant').lean();
  if (!product) return { matched: 0, notified: 0 };
  const alerts = await PriceDropAlert.find({ tenant: tenantId, product: productId, status: 'active' });
  let notified = 0;
  const siteName = await Settings.get('site_name', 'Our Store');
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  for (const alert of alerts) {
    const priceReached = alert.targetPrice === null || alert.targetPrice === undefined || Number(currentPrice) <= Number(alert.targetPrice);
    const priceDropped = Number(currentPrice) < Number(alert.baselinePrice);
    if (!priceDropped || !priceReached) {
      alert.currentPrice = currentPrice;
      alert.lastEvaluatedPrice = currentPrice;
      await alert.save();
      continue;
    }
    await Notification.create({
      tenant: tenantId,
      title: `${product.title} price dropped`,
      message: `${product.title} is now available at ₹${Number(currentPrice).toFixed(2)} (was ₹${Number(alert.baselinePrice).toFixed(2)}).`,
      type: 'alert',
      target: 'specific',
      targetUsers: [alert.user],
      channels: { email: Boolean(alert.email), push: false, sms: false },
      sentAt: new Date(),
      status: 'sent',
      data: {
        kind: 'price_drop',
        productId: String(product._id),
        slug: product.slug,
        currentPrice: Number(currentPrice),
        baselinePrice: Number(alert.baselinePrice),
      },
    });
    if (alert.email) {
      await sendEmail({
        to: alert.email,
        subject: `${product.title} price dropped — ${siteName}`,
        html: `<p><strong>${product.title}</strong> is now available at ₹${Number(currentPrice).toFixed(2)} (was ₹${Number(alert.baselinePrice).toFixed(2)}).</p><p><a href="${clientUrl}/product/${product.slug}">Shop now</a></p>`,
      });
    }
    alert.status = 'notified';
    alert.currentPrice = currentPrice;
    alert.lastEvaluatedPrice = currentPrice;
    alert.notifiedAt = new Date();
    await alert.save();
    notified += 1;
  }
  return { matched: alerts.length, notified };
};

module.exports = { checkAlert, subscribeAlert, unsubscribeAlert, triggerPriceDropAlerts };
