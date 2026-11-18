/* Fresh dummy sales seed: tenant, coupons, combos (bundles), orders + redemptions.
 * Requires catalog seed first (products/users/vendors).
 * Usage: node scripts/seedFreshDummySales.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const slugify = require('slugify');

const Tenant = require('../models/Tenant');
const Coupon = require('../models/Coupon');
const Bundle = require('../models/Bundle');
const Order = require('../models/Order');
const CouponRedemption = require('../models/CouponRedemption');
const Product = require('../models/Product');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');

const MONGO_URI = process.env.MONGO_URI_SEED || process.env.MONGO_URI;
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const daysAgo = (n) => new Date(Date.now() - n * 864e5);

const COUPONS = [
  { code: 'WELCOME10', description: '10% off your first order', type: 'percentage', value: 10, maxDiscount: 500, minOrderAmount: 499, isFirstOrderOnly: true, customerEligibility: 'new', showOnCheckout: true, expiresInDays: 90, usageLimit: 10000 },
  { code: 'FLAT200', description: 'Flat Rs 200 off above Rs 1499', type: 'fixed', value: 200, minOrderAmount: 1499, showOnCheckout: true, expiresInDays: 60, usageLimit: 5000 },
  { code: 'FREESHIP', description: 'Free shipping above Rs 499', type: 'free_shipping', value: 0, minOrderAmount: 499, showOnCheckout: true, expiresInDays: 60, usageLimit: 20000 },
  { code: 'FESTIVE15', description: '15% festive discount up to Rs 1500', type: 'percentage', value: 15, maxDiscount: 1500, minOrderAmount: 999, showOnCheckout: true, expiresInDays: 45, usageLimit: 8000 },
  { code: 'B2B5', description: '5% off for repeat buyers', type: 'percentage', value: 5, maxDiscount: 2000, customerEligibility: 'existing', expiresInDays: 120, usageLimit: 3000 },
  { code: 'BUY2GET1', description: 'Buy 2 get 1 free (lowest priced item)', type: 'buy_x_get_y', buyXGetY: { buyQuantity: 2, getQuantity: 1, getDiscount: 100 }, expiresInDays: 30, usageLimit: 2000 },
  { code: 'COMBO20', description: '20% off combo packs', type: 'bundle', bundleDiscount: 20, expiresInDays: 45, usageLimit: 2000 },
  { code: 'BIGSAVE25', description: 'Up to 25% off on bulk quantity', type: 'tiered', tiers: [{ minQuantity: 2, discount: 10 }, { minQuantity: 4, discount: 18 }, { minQuantity: 6, discount: 25 }], expiresInDays: 30, usageLimit: 1500 },
];

// [name, bundleType, [product titles], tags]
const BUNDLES = [
  ['Grooming Essentials Combo', 'fixed', ['Total Repair 5 Shampoo', 'Face Wash Oily Skin', 'Eyeconic Kajal Pencil'], ['grooming', 'combo']],
  ['Home Starter Kit', 'fixed', ['FADO Table Lamp', 'Non-Stick Cookware Set', 'Dinnerware Set 16-Piece'], ['home', 'combo']],
  ['Fitness Starter Pack', 'fixed', ['Resistance Band Set', 'Speed Rope Pro', 'Yoga Mat 6mm'], ['fitness', 'combo']],
  ['Denim Duo Pack', 'multipack', ['511 Slim Fit Jeans', '501 Original Jeans'], ['denim', 'pack']],
  ['Audio Value Pack', 'fixed', ['WH-1000XM5 Headphones', 'Airdopes Atom 81'], ['audio', 'pack']],
  ['Office Study Kit', 'fixed', ['48 Color Pencil Set', 'A4 Notebook Hardcover', 'Highlighter Pack 10'], ['office', 'kit']],
];

const ORDER_STATUSES_40 = [
  ...Array(12).fill('delivered'), ...Array(5).fill('shipped'), ...Array(3).fill('out_for_delivery'),
  ...Array(3).fill('packed'), ...Array(3).fill('processing'), ...Array(4).fill('confirmed'),
  ...Array(3).fill('pending'), ...Array(3).fill('cancelled'), ...Array(2).fill('returned'), ...Array(2).fill('refunded'),
];
const PAY_METHODS = ['upi', 'upi', 'razorpay', 'cod', 'upi', 'wallet', 'razorpay', 'cod'];
const STATUS_CHAIN = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const RECENCY = { // [minDays, maxDays] order age per status
  pending: [0, 2], confirmed: [1, 5], processing: [2, 7], packed: [2, 8],
  ready_to_ship: [2, 8], shipped: [3, 10], out_for_delivery: [3, 10],
  delivered: [10, 60], cancelled: [5, 40], returned: [12, 55], refunded: [12, 55],
};

function couponDiscount(coupon, subtotal, totalQty, lines, hasBundle) {
  switch (coupon.type) {
    case 'percentage': return Math.min(Math.round((subtotal * coupon.value) / 100), coupon.maxDiscount || Infinity);
    case 'fixed': return subtotal >= (coupon.minOrderAmount || 0) ? Math.min(coupon.value, subtotal) : 0;
    case 'free_shipping': return 0;
    case 'buy_x_get_y': {
      const need = (coupon.buyXGetY?.buyQuantity || 2) + (coupon.buyXGetY?.getQuantity || 1);
      if (totalQty < need) return 0;
      const cheapest = Math.min(...lines.map(l => l.price));
      return Math.round((cheapest * (coupon.buyXGetY?.getDiscount ?? 100)) / 100);
    }
    case 'tiered': {
      const tiers = [...(coupon.tiers || [])].sort((a, b) => b.minQuantity - a.minQuantity);
      const hit = tiers.find(t => totalQty >= t.minQuantity);
      return hit ? Math.round((subtotal * hit.discount) / 100) : 0;
    }
    case 'bundle': {
      if (!hasBundle) return 0;
      const bundleSum = lines.filter(l => l.itemType === 'bundle').reduce((s, l) => s + l.price * l.quantity, 0);
      return Math.round((bundleSum * (coupon.bundleDiscount || 0)) / 100);
    }
    default: return 0;
  }
}

async function main() {
  if (!MONGO_URI) throw new Error('No MONGO_URI configured in .env');
  await mongoose.connect(MONGO_URI);
  console.log(`Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const products = await Product.find().lean();
  const users = await User.find({ role: 'customer' });
  const vendors = await Vendor.find();
  const categories = await Category.find().lean();
  if (products.length < 20) throw new Error('Catalog seed missing — run seedFreshDummy.js first');
  if (users.length < 5) throw new Error('Customer seed missing');
  if (vendors.length < 1) throw new Error('Vendor seed missing');
  const admin = await User.findOne({ role: { $in: ['superadmin', 'admin'] } });
  const byTitle = Object.fromEntries(products.map(p => [p.title, p]));
  const catById = Object.fromEntries(categories.map(c => [String(c._id), c]));

  await Promise.all([Coupon, Bundle, Order, CouponRedemption].map(async (M) => {
    try { await M.collection.drop(); } catch (_) {}
  }));

  let tenant = await Tenant.findOne({ slug: 'dummy-flagship' });
  if (!tenant) {
    tenant = await Tenant.create({ key: 'dummy-flagship', name: 'Dummy Flagship Store', slug: 'dummy-flagship', type: 'store', status: 'active' });
  }
  console.log(`Tenant: ${tenant.slug}`);

  // Coupons
  const beautyCat = categories.find(c => c.slug === 'beauty');
  const couponDocs = await Coupon.insertMany(COUPONS.map((c) => ({
    ...c, expiresAt: daysAgo(-c.expiresInDays), isActive: true,
    startDate: daysAgo(10), usageCount: 0, userLimit: 1,
    allowedChannels: ['website', 'app'],
    applicableCategories: c.code === 'FESTIVE15' && beautyCat ? [beautyCat._id] : [],
  })));
  const couponByCode = Object.fromEntries(couponDocs.map(c => [c.code, c]));
  // COMBO20 references combo component products
  const comboTitles = [...new Set(BUNDLES.flatMap(b => b[2]))];
  await Coupon.findByIdAndUpdate(couponByCode.COMBO20._id, {
    bundleProducts: comboTitles.map(t => byTitle[t]._id),
  });
  console.log(`Coupons: ${couponDocs.length}`);

  // Combos (bundles)
  const bundleDocs = [];
  for (let i = 0; i < BUNDLES.length; i++) {
    const [name, bundleType, titles, tags] = BUNDLES[i];
    const comps = titles.map(t => byTitle[t]);
    if (comps.some(c => !c)) throw new Error(`Product missing for bundle ${name}`);
    const sum = comps.reduce((s, p) => s + p.price, 0);
    const price = Math.round((sum * 0.85) / 10) * 10;
    const first = comps[0];
    bundleDocs.push(await Bundle.create({
      tenant: tenant._id, name, bundleType,
      slug: slugify(name, { lower: true, strict: true }),
      sku: `CMB-${String(i + 1).padStart(4, '0')}`,
      description: `${name} — curated value pack. ${comps.map(c => c.title).join(', ')}.`,
      shortDescription: `Save more with the ${name}.`,
      components: comps.map((p, ci) => ({
        product: p._id, quantity: 1, required: true, sortOrder: ci,
        defaultVariant: p.variants?.[0]?.options?.[0]
          ? { [p.variants[0].name]: p.variants[0].options[0].value } : {},
      })),
      price, comparePrice: sum, pricingType: 'fixed',
      discountType: 'percentage', discountValue: 15,
      costPrice: comps.reduce((s, p) => s + (p.costPrice || 0), 0),
      hsnCode: '9999', gstRate: 18,
      image: first.thumbnail,
      gallery: first.images?.slice(0, 2).map(im => ({ url: im.url, alt: name })) || [],
      tags, category: first.category, vendor: first.vendor,
      stats: { views: randInt(200, 3000), addToCart: randInt(20, 400), unitsSold: 0, revenue: 0, discount: 0 },
      lifecycleStatus: 'active', isActive: true,
      createdBy: admin?._id,
    }));
  }
  console.log(`Combos: ${bundleDocs.length}`);

  // Orders — 40 across the lifecycle
  const orderDocs = [];
  const redemptionDocs = [];
  const shuffledProducts = shuffled(products);
  for (let i = 0; i < ORDER_STATUSES_40.length; i++) {
    const status = ORDER_STATUSES_40[i];
    const user = users[(i * 7) % users.length];
    const payMethod = pick(PAY_METHODS);
    const [ageMin, ageMax] = RECENCY[status] || [0, 30];
    const createdAt = daysAgo(randInt(ageMin, ageMax));

    const nLines = randInt(1, 3);
    const lines = [];
    for (let k = 0; k < nLines; k++) {
      const p = shuffledProducts[(i * 3 + k) % shuffledProducts.length];
      const opt = p.variants?.[0]?.options?.[0];
      lines.push({
        itemType: 'product', product: p._id, title: p.title, image: p.thumbnail,
        price: p.price, costPrice: p.costPrice || null, costPriceCaptured: p.costPrice != null,
        quantity: randInt(1, 2),
        variant: opt ? { [p.variants[0].name]: opt.value } : undefined,
        sku: p.sku, hsnCode: p.hsnCode || '9999', taxRate: 18,
        vendorId: p.vendor,
      });
    }
    // Every ~7th order also buys a combo
    let bundleLine = null;
    if (i % 7 === 3) {
      const b = bundleDocs[i % bundleDocs.length];
      bundleLine = {
        itemType: 'bundle', bundle: b._id, bundleVersion: 1,
        bundleName: b.name, bundleSku: b.sku, title: b.name, image: b.image,
        price: b.price, quantity: 1, taxRate: 18,
        vendorId: b.vendor,
      };
      lines.push(bundleLine);
    }
    const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const totalQty = lines.reduce((s, l) => s + l.quantity, 0);

    // Coupon on alternate orders when conditions hold
    let coupon = null;
    let discount = 0;
    if (i % 2 === 0) {
      for (const code of shuffled(COUPONS.map(c => c.code))) {
        if (code === 'COMBO20' && !bundleLine) continue;
        const c = couponByCode[code];
        if (subtotal < (c.minOrderAmount || 0)) continue;
        const d = couponDiscount(c, subtotal, totalQty, lines, !!bundleLine);
        if (d > 0 || c.type === 'free_shipping') { coupon = c; discount = d; break; }
      }
    }
    const shippingCost = (coupon?.type === 'free_shipping' || subtotal - discount >= 999) ? 0 : 49;
    const tax = Math.round((subtotal - discount) * 0.18);
    const total = subtotal - discount + shippingCost + tax;

    let paymentStatus = 'pending';
    if (['delivered', 'shipped', 'out_for_delivery', 'packed', 'processing', 'confirmed'].includes(status)) {
      paymentStatus = (payMethod === 'cod' && status !== 'delivered') ? 'pending' : 'paid';
    } else if (status === 'returned' || status === 'refunded') paymentStatus = 'refunded';

    // Split lines by vendor into sub-orders
    const byVendor = {};
    for (const l of lines) {
      const v = String(l.vendorId || vendors[0]._id);
      (byVendor[v] = byVendor[v] || []).push(l);
    }
    const stripVendor = ({ vendorId, ...rest }) => rest;
    const subOrders = Object.entries(byVendor).map(([vid, vlines], si) => {
      const st = vlines.reduce((s, l) => s + l.price * l.quantity, 0);
      return {
        vendor: vid, orderNumber: `FRSH-ORD-${String(i + 1).padStart(4, '0')}-${String.fromCharCode(65 + si)}`,
        items: vlines.map(stripVendor), subtotal: st, shippingCost: 0,
        tax: Math.round(st * 0.18), discount: 0, total: Math.round(st * 1.18),
        coupon: coupon?._id, couponCode: coupon?.code,
        commissionRate: 10, commissionableAmount: st,
        commissionAmount: Math.round(st * 0.1), vendorEarnings: Math.round(st * 0.9),
        status, statusHistory: [{ status, note: 'Dummy seed status', updatedAt: createdAt }],
        paymentStatus,
      };
    });

    const chain = STATUS_CHAIN.slice(0, STATUS_CHAIN.indexOf(status) + 1);
    const statusHistory = (STATUS_CHAIN.includes(status) ? chain : ['pending', 'confirmed', status])
      .map((s, si) => ({ status: s, note: 'Dummy seed progression', updatedAt: new Date(createdAt.getTime() + si * 864e5) }));

    const addr = user.addresses?.[0];
    const order = await Order.create({
      orderNumber: `FRSH-ORD-${String(i + 1).padStart(4, '0')}`,
      user: user._id,
      items: lines.map(stripVendor),
      inventoryItems: lines.map(stripVendor),
      shippingAddress: addr ? {
        fullName: addr.fullName, phone: addr.phone, street: addr.street,
        city: addr.city, state: addr.state, pincode: addr.pincode, country: 'India',
      } : { fullName: user.name, phone: user.phone, street: '1 MG Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', country: 'India' },
      paymentMethod: payMethod, paymentStatus,
      paymentId: paymentStatus === 'paid' ? `pay_${Date.now().toString(36)}${i}` : undefined,
      orderStatus: status,
      returnStatus: status === 'returned' ? 'received' : status === 'refunded' ? 'refunded' : 'none',
      refundTotal: (status === 'returned' || status === 'refunded') ? total : 0,
      statusHistory, subtotal, shippingCost, tax, discount, total,
      amountPaid: paymentStatus === 'paid' ? total : 0,
      amountDue: paymentStatus === 'paid' ? 0 : total,
      coupon: coupon?._id, couponCode: coupon?.code,
      subOrders,
      shippingMethod: 'standard',
      estimatedDelivery: ['delivered', 'cancelled', 'returned', 'refunded'].includes(status) ? undefined : new Date(createdAt.getTime() + 5 * 864e5),
      deliveredAt: status === 'delivered' ? new Date(createdAt.getTime() + 4 * 864e5) : undefined,
      cancelledAt: status === 'cancelled' ? new Date(createdAt.getTime() + 1 * 864e5) : undefined,
      cancellationReason: status === 'cancelled' ? pick(['Ordered by mistake', 'Found better price elsewhere', 'Delivery taking too long']) : undefined,
      createdAt, updatedAt: createdAt,
    });
    orderDocs.push(order);

    if (coupon) {
      redemptionDocs.push({
        tenant: tenant._id, coupon: coupon._id, order: order._id, user: user._id,
        code: coupon.code, discountAmount: discount,
        status: paymentStatus === 'paid' ? 'captured' : 'reserved',
        capturedAt: paymentStatus === 'paid' ? createdAt : undefined,
      });
      await Coupon.findByIdAndUpdate(coupon._id, {
        $inc: { usageCount: 1 },
        $push: { usedBy: { user: user._id, order: order._id, usedAt: createdAt } },
      });
    }
  }
  console.log(`Orders: ${orderDocs.length}`);
  await CouponRedemption.insertMany(redemptionDocs);
  console.log(`Redemptions: ${redemptionDocs.length}`);

  // User purchase rollups (skip cancelled)
  for (const u of users) {
    const mine = orderDocs.filter(o => String(o.user) === String(u._id) && o.orderStatus !== 'cancelled');
    if (!mine.length) continue;
    await User.findByIdAndUpdate(u._id, {
      orderCount: mine.length,
      totalSpent: mine.reduce((s, o) => s + o.total, 0),
      lastOrderAt: mine.map(o => o.createdAt).sort((a, b) => b - a)[0],
    });
  }
  // Combo sales rollups
  for (const b of bundleDocs) {
    const lines = orderDocs.flatMap(o => o.items.filter(l => l.itemType === 'bundle' && String(l.bundle) === String(b._id)));
    const qty = lines.reduce((s, l) => s + l.quantity, 0);
    await Bundle.findByIdAndUpdate(b._id, {
      $set: { 'stats.unitsSold': qty, 'stats.revenue': qty * b.price },
    });
  }

  // ---- Verification ----
  console.log('--- Verification ---');
  const errors = [];
  const counts = {
    coupons: await Coupon.countDocuments(),
    combos: await Bundle.countDocuments(),
    orders: await Order.countDocuments(),
    redemptions: await CouponRedemption.countDocuments(),
  };
  console.log(counts);
  if (counts.coupons !== 8) errors.push(`coupons=${counts.coupons}`);
  if (counts.combos !== 6) errors.push(`combos=${counts.combos}`);
  if (counts.orders !== 40) errors.push(`orders=${counts.orders}`);

  const productIds = new Set(products.map(p => String(p._id)));
  const bundleIds = new Set(bundleDocs.map(b => String(b._id)));
  const userIds = new Set([...users.map(u => String(u._id))]);
  const couponIds = new Set(couponDocs.map(c => String(c._id)));
  const byStatus = {};
  for (const o of await Order.find().lean()) {
    byStatus[o.orderStatus] = (byStatus[o.orderStatus] || 0) + 1;
    if (!userIds.has(String(o.user))) errors.push(`${o.orderNumber}: bad user`);
    for (const l of o.items) {
      if (l.itemType === 'bundle' && !bundleIds.has(String(l.bundle))) errors.push(`${o.orderNumber}: bad bundle ref`);
      if (l.itemType !== 'bundle' && !productIds.has(String(l.product))) errors.push(`${o.orderNumber}: bad product ref`);
      if (!(l.price > 0) || !(l.quantity >= 1)) errors.push(`${o.orderNumber}: bad line math`);
    }
    if (o.total !== o.subtotal - o.discount + o.shippingCost + o.tax) {
      errors.push(`${o.orderNumber}: total mismatch (${o.total} vs ${o.subtotal}-${o.discount}+${o.shippingCost}+${o.tax})`);
    }
    if (o.coupon && !couponIds.has(String(o.coupon))) errors.push(`${o.orderNumber}: bad coupon ref`);
    if (!o.subOrders?.length) errors.push(`${o.orderNumber}: no sub-orders`);
  }
  console.log('By status:', byStatus);
  const couponOrders = await Order.countDocuments({ coupon: { $exists: true, $ne: null } });
  if (counts.redemptions !== couponOrders) errors.push(`redemptions=${counts.redemptions} vs coupon orders=${couponOrders}`);
  for (const c of await Coupon.find().lean()) {
    if (!c.isActive || c.expiresAt < new Date()) errors.push(`coupon ${c.code} inactive/expired`);
  }
  for (const b of await Bundle.find().lean()) {
    if (!b.components?.length || !b.isActive || b.lifecycleStatus !== 'active') errors.push(`bundle ${b.slug} incomplete`);
  }
  if (errors.length) {
    console.error(`VERIFY FAILED (${errors.length}):`);
    errors.slice(0, 30).forEach(e => console.error(' -', e));
    process.exit(1);
  }
  console.log('Sales seed complete — all checks passed.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
