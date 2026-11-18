/* Platform-wide dummy seed: shopper + marketing + operations data.
 * Requires catalog seed (seedFreshDummy.js) + sales seed (seedFreshDummySales.js).
 * Usage: node scripts/seedFreshDummyPlatform.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const slugify = require('slugify');

const Tenant = require('../models/Tenant');
const Product = require('../models/Product');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const Bundle = require('../models/Bundle');
const Cart = require('../models/Cart');
const AbandonedCart = require('../models/AbandonedCart');
const ProductQuestion = require('../models/ProductQuestion');
const PriceDropAlert = require('../models/PriceDropAlert');
const StockAlert = require('../models/StockAlert');
const ReferralCode = require('../models/ReferralCode');
const ReferralTracking = require('../models/ReferralTracking');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const LoyaltyAccount = require('../models/LoyaltyAccount');
const LoyaltyTransaction = require('../models/LoyaltyTransaction');
const CustomerWallet = require('../models/CustomerWallet');
const WalletTransaction = require('../models/WalletTransaction');
const GiftCard = require('../models/GiftCard');
const Campaign = require('../models/Campaign');
const PriceRule = require('../models/PriceRule');
const BlogCategory = require('../models/BlogCategory');
const Blog = require('../models/Blog');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const Notification = require('../models/Notification');
const UserNotification = require('../models/UserNotification');
const CustomerSegment = require('../models/CustomerSegment');
const CustomerSegmentMembership = require('../models/CustomerSegmentMembership');
const ProductRecommendationRule = require('../models/ProductRecommendationRule');
const AffiliateProgram = require('../models/AffiliateProgram');
const AffiliateProfile = require('../models/AffiliateProfile');
const Warehouse = require('../models/Warehouse');
const WarehouseInventory = require('../models/WarehouseInventory');
const Shipment = require('../models/Shipment');
const ShipmentEvent = require('../models/ShipmentEvent');
const PaymentTransaction = require('../models/PaymentTransaction');
const Invoice = require('../models/Invoice');
const VendorLedger = require('../models/VendorLedger');
const Payout = require('../models/Payout');
const ReturnRequest = require('../models/ReturnRequest');
const RefundRequest = require('../models/RefundRequest');
const SupportTicket = require('../models/SupportTicket');

const MONGO_URI = process.env.MONGO_URI_SEED || process.env.MONGO_URI;
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const daysAgo = (n) => new Date(Date.now() - n * 864e5);
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const QUESTIONS = [
  'Is this product genuine with brand warranty?',
  'What is the exact size and fit? Does it run true to size?',
  'Is cash on delivery available for this item?',
  'How many days does delivery take to Bangalore?',
  'Does it come with all accessories shown in the images?',
  'What is the return policy if I get a defective piece?',
  'Which variant should I pick for daily use?',
  'Is the color exactly the same as shown in photos?',
];
const ANSWERS = [
  'Yes, 100% genuine with GST invoice and standard brand warranty where applicable.',
  'It runs true to size. Please check the variant guide on the page before ordering.',
  'Delivery usually takes 2-4 working days depending on your pincode.',
  'Yes, everything shown in the images is included in the box.',
  'Unused items in original packing get a 7-day easy replacement.',
];

let DB = {};
async function loadBase() {
  DB.tenant = await Tenant.findOne({ slug: 'dummy-flagship' });
  if (!DB.tenant) throw new Error('Tenant missing — run seedFreshDummySales.js first');
  DB.products = await Product.find().lean();
  DB.users = await User.find({ role: 'customer' });
  DB.vendors = await Vendor.find();
  DB.categories = await Category.find().lean();
  DB.orders = await Order.find().sort({ createdAt: 1 });
  DB.coupons = await Coupon.find();
  DB.bundles = await Bundle.find();
  DB.admin = await User.findOne({ role: { $in: ['superadmin', 'admin'] } });
  if (DB.products.length < 100 || DB.orders.length < 40) throw new Error('Catalog/sales seed missing');
}

async function seedShopper() {
  const { tenant, products, users, admin } = DB;
  // Carts — 8 active shoppers
  for (let i = 0; i < 8; i++) {
    const user = users[i];
    const items = shuffled(products).slice(0, randInt(1, 3)).map((p) => ({
      itemType: 'product', product: p._id, quantity: randInt(1, 2),
      variant: p.variants?.[0]?.options?.[0] ? { [p.variants[0].name]: p.variants[0].options[0].value } : {},
    }));
    await Cart.create({ tenant: tenant._id, user: user._id, items });
  }
  // Wishlists
  for (let i = 0; i < 10; i++) {
    await User.findByIdAndUpdate(users[(i * 3) % users.length]._id, {
      wishlist: shuffled(products).slice(0, randInt(2, 4)).map(p => p._id),
    });
  }
  // Product Q&A — 30 answered questions
  for (let i = 0; i < 30; i++) {
    const p = products[(i * 3) % products.length];
    const asker = users[i % users.length];
    const replier = users[(i + 5) % users.length];
    await ProductQuestion.create({
      product: p._id, user: asker._id,
      question: QUESTIONS[i % QUESTIONS.length],
      answers: [
        { user: replier._id, text: ANSWERS[i % ANSWERS.length] },
        ...(i % 3 === 0 && admin ? [{ user: admin._id, isAdmin: true, text: 'Official store reply: covered by the standard replacement policy.' }] : []),
      ],
      upvotes: randInt(0, 25), status: 'active',
    });
  }
  // Price-drop + stock alerts (unique pairs)
  for (let i = 0; i < 12; i++) {
    const p = products[(i * 7) % products.length];
    const u = users[i % users.length];
    await PriceDropAlert.create({
      tenant: tenant._id, user: u._id, product: p._id,
      email: u.email, baselinePrice: p.price,
      targetPrice: Math.round(p.price * 0.9), currentPrice: p.price, status: 'active',
    });
    const p2 = products[(i * 11 + 5) % products.length];
    const u2 = users[(i + 3) % users.length];
    await StockAlert.create({
      tenant: tenant._id, user: u2._id, product: p2._id, email: u2.email, notified: false,
    });
  }
  // Referral codes + tracking
  const refCodes = [];
  for (let i = 0; i < 10; i++) {
    const p = products[i * 10];
    const owner = users[i % users.length];
    refCodes.push(await ReferralCode.create({
      code: `REF-${p.slug.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}-${i + 1}`,
      product: p._id, owner: owner._id, ownerName: owner.name,
      ownerType: i % 2 ? 'influencer' : 'campaign',
      isActive: true, expiresAt: daysAgo(-90),
      commissionRate: randInt(5, 10), commissionType: 'percentage',
      stats: { clicks: randInt(50, 800), uniqueClicks: randInt(30, 500), conversions: randInt(0, 12), revenue: randInt(2000, 90000) },
    }));
  }
  for (let i = 0; i < 40; i++) {
    const rc = refCodes[i % refCodes.length];
    await ReferralTracking.create({
      referralCode: rc._id, code: rc.code, product: rc.product, type: 'click',
      sessionId: `sess-dummy-${i}`, userId: users[(i * 2) % users.length]._id,
      ip: `49.37.${i}.${i + 10}`, device: pick(['mobile', 'mobile', 'desktop', 'tablet']),
      browser: 'Chrome', os: pick(['Android', 'iOS', 'Windows']), country: 'India',
      city: pick(['Mumbai', 'Delhi', 'Bengaluru', 'Pune']), landingPage: `/product/${rc.product}`,
    });
  }
  const delivered = DB.orders.filter(o => o.orderStatus === 'delivered').slice(0, 8);
  for (let i = 0; i < delivered.length; i++) {
    const rc = refCodes[i % refCodes.length];
    const o = delivered[i];
    await ReferralTracking.create({
      referralCode: rc._id, code: rc.code, product: rc.product, type: 'conversion',
      sessionId: `sess-conv-${i}`, userId: o.user, order: o._id,
      orderValue: o.total, commissionAmount: Math.round(o.total * rc.commissionRate / 100),
      device: 'mobile', country: 'India',
    });
    await ReferralCode.findByIdAndUpdate(rc._id, { $inc: { usageCount: 1, 'stats.conversions': 1, 'stats.revenue': o.total } });
    await Order.findByIdAndUpdate(o._id, { referralCode: rc.code, referralSource: 'referral' });
  }
  // Loyalty
  let program = await LoyaltyProgram.findOne({ tenant: tenant._id });
  if (!program) program = await LoyaltyProgram.create({ tenant: tenant._id, enabled: true, earnPointsPerCurrency: 1, updatedBy: admin?._id });
  for (const u of users) {
    const earned = randInt(0, 1200);
    const redeemed = earned > 300 ? randInt(0, 200) : 0;
    const acc = await LoyaltyAccount.create({
      tenant: tenant._id, user: u._id,
      pointsBalance: earned - redeemed, lifetimeEarned: earned, lifetimeRedeemed: redeemed,
      tier: earned >= 1000 ? 'silver' : 'bronze', status: 'active', lastTransactionAt: daysAgo(randInt(0, 20)),
    });
    await LoyaltyTransaction.create({
      tenant: tenant._id, user: u._id, account: acc._id,
      direction: 'earn', points: Math.max(earned, 1), balanceAfter: earned,
      source: 'purchase', referenceType: 'Order', note: 'Points on dummy purchase',
      idempotencyKey: `loy-earn-${u._id}`,
    });
    if (redeemed > 0) {
      await LoyaltyTransaction.create({
        tenant: tenant._id, user: u._id, account: acc._id,
        direction: 'redeem', points: redeemed, balanceAfter: earned - redeemed,
        source: 'checkout_redeem', note: 'Redeemed at dummy checkout',
        idempotencyKey: `loy-red-${u._id}`,
      });
    }
  }
  // Wallets
  for (const u of users) {
    const cash = pick([0, 0, randInt(100, 1500)]);
    const promo = randInt(50, 300);
    const wallet = await CustomerWallet.create({
      tenant: tenant._id, user: u._id, currency: 'INR',
      cashBalance: cash, promotionalBalance: promo, status: 'active', lastTransactionAt: new Date(),
    });
    await WalletTransaction.create({
      tenant: tenant._id, user: u._id, wallet: wallet._id,
      direction: 'credit', bucket: 'promotional', amount: promo,
      balanceAfter: cash + promo, cashBalanceAfter: cash, promotionalBalanceAfter: promo,
      source: 'promotional', note: 'Welcome bonus', idempotencyKey: `wal-promo-${u._id}`,
    });
    if (cash > 0) {
      await WalletTransaction.create({
        tenant: tenant._id, user: u._id, wallet: wallet._id,
        direction: 'credit', bucket: 'cash', amount: cash,
        balanceAfter: cash + promo, cashBalanceAfter: cash, promotionalBalanceAfter: promo,
        source: 'refund', note: 'Dummy order refund credit', idempotencyKey: `wal-cash-${u._id}`,
      });
    }
  }
  // Gift cards
  for (let i = 0; i < 6; i++) {
    const code = `FRSHGC-${1000 + i * 137}-${2000 + i * 291}`;
    const amount = pick([500, 1000, 1000, 2000, 5000, 500]);
    const depleted = i === 5;
    await GiftCard.create({
      tenant: tenant._id, recipientUser: users[i % users.length]._id,
      codeHash: crypto.createHash('sha256').update(code).digest('hex'),
      codeLast4: code.slice(-4), initialAmount: amount,
      balance: depleted ? 0 : amount, status: depleted ? 'depleted' : 'active',
      expiresAt: daysAgo(-365), recipientName: users[i % users.length].name,
      senderName: 'Tatoz Store', message: 'Happy shopping!',
    });
  }
  console.log('Shopper data seeded');
}
async function seedMarketing() {
  const { tenant, products, users, categories, admin } = DB;
  // Coupon top-up — total becomes 12
  const beautyCat = categories.find(c => c.slug === 'beauty');
  const iphone = products.find(p => p.title === 'iPhone 15');
  const macbook = products.find(p => p.title === 'MacBook Air M3');
  const tv = products.find(p => p.title === 'Bravia 50in 4K Smart TV');
  await Coupon.insertMany([
    { code: 'BEAUTY10', description: '10% off beauty picks', type: 'percentage', value: 10, maxDiscount: 300, minOrderAmount: 299, applicableCategories: beautyCat ? [beautyCat._id] : [], showOnCheckout: true, expiresAt: daysAgo(-60), isActive: true, startDate: daysAgo(5) },
    { code: 'ELECTRO5', description: '5% off premium electronics', type: 'percentage', value: 5, maxDiscount: 2000, minOrderAmount: 9999, applicableProducts: [iphone, macbook, tv].filter(Boolean).map(p => p._id), expiresAt: daysAgo(-45), isActive: true, startDate: daysAgo(5) },
    { code: 'FIRSTBUY', description: 'Flat Rs 150 off first purchase', type: 'fixed', value: 150, minOrderAmount: 799, isFirstOrderOnly: true, customerEligibility: 'new', showOnCheckout: true, expiresAt: daysAgo(-90), isActive: true, startDate: daysAgo(5) },
    { code: 'WEEKEND12', description: '12% off this weekend', type: 'percentage', value: 12, maxDiscount: 800, minOrderAmount: 1499, showOnCheckout: true, expiresAt: daysAgo(-14), isActive: true, startDate: daysAgo(2) },
  ]);
  // Campaigns
  const campaigns = [
    { name: 'Diwali Festive Sale', objective: 'promotional', channels: ['in_app', 'email', 'push'], title: 'Festive dhamaka — up to 40% off', message: 'Celebrate with storewide festive pricing across electronics, fashion and home.', status: 'completed' },
    { name: 'New Arrivals Launch', objective: 'product_launch', channels: ['in_app', 'push'], title: 'Fresh drops are live', message: 'Explore newly added products across every department this week.', status: 'running' },
    { name: 'Win-back Lapsed Shoppers', objective: 'win_back', channels: ['email', 'sms'], title: 'We miss you — extra 10% back', message: 'Come back and enjoy an extra loyalty bonus on your next order.', status: 'scheduled' },
  ];
  for (const c of campaigns) await Campaign.create({ tenant: tenant._id, ...c });
  // Price rules
  const electronics = categories.find(c => c.slug === 'electronics');
  const home = categories.find(c => c.slug === 'home-and-kitchen');
  await PriceRule.create({ tenant: tenant._id, name: 'Wholesale 12% Off Electronics', customerTiers: ['wholesale'], discountType: 'percentage', value: 12, categories: electronics ? [electronics._id] : [], isActive: true });
  await PriceRule.create({ tenant: tenant._id, name: 'Dealer Flat 500 Off Home', customerTiers: ['dealer'], discountType: 'fixed_discount', value: 500, categories: home ? [home._id] : [], isActive: true });
  await PriceRule.create({ tenant: tenant._id, name: 'VIP 8% Storewide', customerTiers: ['custom'], discountType: 'percentage', value: 8, isActive: true });
  // Blog
  const blogCats = await BlogCategory.insertMany([
    { name: 'Buying Guides', slug: 'buying-guides' },
    { name: 'Festive Offers', slug: 'festive-offers' },
    { name: 'Lifestyle', slug: 'lifestyle' },
  ]);
  const posts = [
    ['How to pick the right running shoes', 'buying-guides', 'Cushioning, fit and terrain — everything to check before buying your next pair of runners.'],
    ['Festive gifting guide under Rs 2000', 'festive-offers', 'Thoughtful gifts across beauty, home and accessories that never cross Rs 2000.'],
    ['Small kitchen upgrades, big difference', 'lifestyle', 'Five affordable kitchen swaps that make everyday cooking faster and easier.'],
    ['Skincare basics for beginners', 'buying-guides', 'Cleanser, moisturizer, sunscreen — the only three steps you need to start.'],
    ['Setting up a home office on a budget', 'lifestyle', 'Desk, lighting and stationery picks for a productive corner under Rs 15000.'],
    ['Why combos save you more', 'festive-offers', 'How curated value packs cut 15% off versus buying every item separately.'],
  ];
  for (let i = 0; i < posts.length; i++) {
    const [title, catSlug, excerpt] = posts[i];
    await Blog.create({
      title, slug: slugify(title, { lower: true, strict: true }),
      content: `${excerpt}\n\nThis is a dummy storefront article for platform demonstration. Replace with real editorial content before launch.`,
      excerpt, category: blogCats.find(c => c.slug === catSlug)._id,
      author: admin._id, status: 'published', publishedAt: daysAgo(randInt(1, 40)),
    });
  }
  // Newsletter
  const subs = [...users.map(u => u.email), 'guest.one@example.com', 'guest.two@example.com', 'guest.three@example.com', 'guest.four@example.com', 'guest.five@example.com'];
  await NewsletterSubscriber.insertMany(subs.map((email) => ({ email, status: 'active' })));
  // Notifications + per-user inbox
  const n1 = await Notification.create({ title: 'Festive sale is live', message: 'Up to 40% off across the store this week.', type: 'promo', target: 'all', status: 'sent', sentAt: new Date() });
  const n2 = await Notification.create({ title: 'Your order has shipped', message: 'Track your package from the orders page.', type: 'order', target: 'specific', targetUsers: users.slice(0, 5).map(u => u._id), status: 'sent', sentAt: new Date() });
  await Notification.create({ title: 'Scheduled maintenance', message: 'The storefront will be briefly unavailable on Sunday 2-3 AM.', type: 'system', target: 'all', status: 'scheduled', scheduledAt: daysAgo(-3) });
  const n4 = await Notification.create({ title: 'New review received', message: 'A buyer reviewed a product from your store.', type: 'review', target: 'specific', targetUsers: users.slice(5, 8).map(u => u._id), status: 'sent', sentAt: new Date() });
  for (const u of users.slice(0, 5)) {
    await UserNotification.create({ user: u._id, notification: n2._id, isRead: pick([true, false]) });
  }
  for (const u of users.slice(5, 8)) {
    await UserNotification.create({ user: u._id, notification: n4._id, isRead: false });
  }
  await UserNotification.create({ user: users[0]._id, notification: n1._id, isRead: true, readAt: new Date() });
  // Segments + memberships
  const vip = await CustomerSegment.create({ tenant: tenant._id, name: 'High value shoppers', slug: 'high-value', definition: { match: 'all', conditions: [{ field: 'totalSpent', operator: 'gte', value: 10000 }] }, isActive: true });
  const fresh = await CustomerSegment.create({ tenant: tenant._id, name: 'New customers', slug: 'new-customers', definition: { match: 'all', conditions: [{ field: 'orderCount', operator: 'lte', value: 1 }] }, isActive: true });
  const lapse = await CustomerSegment.create({ tenant: tenant._id, name: 'At-risk lapsed', slug: 'at-risk', definition: { match: 'all', conditions: [{ field: 'daysSinceOrder', operator: 'gte', value: 45 }] }, isActive: true });
  const ranked = [...users].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
  for (const u of ranked.slice(0, 5)) await CustomerSegmentMembership.create({ tenant: tenant._id, segment: vip._id, user: u._id });
  for (const u of users.filter(u => (u.orderCount || 0) <= 1).slice(0, 5)) {
    try { await CustomerSegmentMembership.create({ tenant: tenant._id, segment: fresh._id, user: u._id }); } catch (_) {}
  }
  await CustomerSegment.findByIdAndUpdate(vip._id, { memberCount: 5, lastEvaluatedAt: new Date() });
  // Recommendation rules — 12 across categories
  const types = ['related', 'frequently_bought', 'upsell', 'cross_sell'];
  const byCat = {};
  for (const p of products) {
    const k = String(p.category);
    (byCat[k] = byCat[k] || []).push(p);
  }
  let rr = 0;
  for (const [catId, list] of Object.entries(byCat)) {
    if (list.length < 4 || rr >= 12) continue;
    await ProductRecommendationRule.create({
      tenant: tenant._id, type: types[rr % types.length],
      sourceProduct: list[0]._id, targetProducts: list.slice(1, 4).map(p => p._id),
      label: 'Frequently bought together', enabled: true, priority: rr, maxItems: 4,
    });
    rr++;
  }
  // Affiliate
  await AffiliateProgram.create({ tenant: tenant._id, enabled: true, defaultCommissionRate: 8, minimumPayout: 500, terms: 'Dummy affiliate terms for platform demonstration.' });
  for (let i = 0; i < 3; i++) {
    await AffiliateProfile.create({ user: users[i * 4]._id, status: 'approved' });
  }
  console.log('Marketing data seeded');
}
async function seedOperations() {
  const { tenant, products, users, vendors, admin } = DB;
  const orders = await Order.find().sort({ createdAt: 1 });
  // Warehouses + inventory
  const wh1 = await Warehouse.create({ tenant: tenant._id, code: 'WH-MUM', name: 'Mumbai Central Warehouse', address: { line1: 'Plot 12, MIDC', city: 'Mumbai', state: 'Maharashtra', pincode: '400093' }, priority: 10, isActive: true });
  const wh2 = await Warehouse.create({ tenant: tenant._id, code: 'WH-DEL', name: 'Delhi North Warehouse', address: { line1: 'Plot 7, Narela', city: 'Delhi', state: 'Delhi', pincode: '110040' }, priority: 5, isActive: true });
  for (const p of products) {
    for (const wh of [wh1, wh2]) {
      await WarehouseInventory.create({
        tenant: tenant._id, warehouse: wh._id, product: p._id, skuSnapshot: p.sku,
        quantity: randInt(20, 200), reservedQuantity: randInt(0, 10),
        incomingQuantity: randInt(0, 50), soldQuantity: randInt(0, 300),
        reorderLevel: 10, lastCountedAt: daysAgo(randInt(0, 7)),
      });
    }
  }
  // Shipments + tracking events for shippable orders
  const shipMap = { shipped: 'in_transit', out_for_delivery: 'out_for_delivery', delivered: 'delivered' };
  const shippable = orders.filter(o => shipMap[o.orderStatus]);
  for (const o of shippable) {
    const ship = await Shipment.create({
      tenant: tenant._id, order: o._id, provider: 'delhivery',
      idempotencyKey: `ship-${o.orderNumber}`,
      status: shipMap[o.orderStatus],
      trackingNumber: `DLV${randInt(1000000000, 9999999999)}`,
      courierName: 'Delhivery Express',
    });
    const steps = ['created', 'pickup_scheduled', 'in_transit'];
    if (['out_for_delivery', 'delivered'].includes(o.orderStatus)) steps.push('out_for_delivery');
    if (o.orderStatus === 'delivered') steps.push('delivered');
    for (let s = 0; s < steps.length; s++) {
      await ShipmentEvent.create({
        tenant: tenant._id, shipment: ship._id, order: o._id, provider: 'delhivery',
        eventKey: `ev-${s + 1}`, status: steps[s],
        description: `Dummy tracking update: ${steps[s].replace(/_/g, ' ')}`,
        location: pick(['Mumbai', 'Delhi', 'Bengaluru', 'Pune']),
        eventAt: new Date(o.createdAt.getTime() + (s + 1) * 864e5), source: 'system',
      });
    }
    await Order.findByIdAndUpdate(o._id, { trackingNumber: ship.trackingNumber, shippingProvider: 'delhivery' });
  }
  // Payment transactions for money-moved orders
  for (const o of orders.filter(o => o.paymentStatus === 'paid')) {
    await PaymentTransaction.create({
      tenant: tenant._id, order: o._id,
      provider: o.paymentMethod === 'cod' ? 'cod' : o.paymentMethod,
      eventType: 'provider_captured', status: 'succeeded',
      amount: o.total, currency: 'INR',
      externalPaymentId: o.paymentId || `pay_dummy${o.orderNumber}`,
      idempotencyKey: `paytx-${o.orderNumber}`, source: 'checkout',
    });
  }
  for (const o of orders.filter(o => o.paymentStatus === 'refunded')) {
    await PaymentTransaction.create({
      tenant: tenant._id, order: o._id,
      provider: o.paymentMethod === 'cod' ? 'cod' : o.paymentMethod,
      eventType: 'refunded', status: 'succeeded',
      amount: o.total, currency: 'INR',
      idempotencyKey: `paytx-ref-${o.orderNumber}`, source: 'webhook',
    });
  }
  // Invoices for delivered orders
  let invN = 0;
  for (const o of orders.filter(o => o.orderStatus === 'delivered')) {
    invN++;
    const lines = o.items.map((l, idx) => {
      const gross = l.price * l.quantity;
      const tax = Math.round(gross * 0.18);
      return {
        itemIndex: idx, title: l.title, sku: l.sku || '', hsnCode: l.hsnCode || '9999',
        quantity: l.quantity, unitPrice: l.price, grossAmount: gross,
        taxableAmount: gross, cgst: Math.round(tax / 2), sgst: tax - Math.round(tax / 2), tax,
      };
    });
    const inv = await Invoice.create({
      tenant: tenant._id, order: o._id, orderNumber: o.orderNumber,
      invoiceNumber: `INV-2026-${String(invN).padStart(4, '0')}`,
      documentType: 'tax_invoice', status: 'issued', source: 'automatic',
      lines, subtotal: o.subtotal, tax: o.tax, total: o.total,
    });
    await Order.findByIdAndUpdate(o._id, { invoice: inv._id, invoiceNumber: inv.invoiceNumber, invoiceIssuedAt: o.deliveredAt || o.createdAt });
  }
  // Vendor ledger from delivered sub-orders + payouts
  for (const v of vendors) {
    let balance = 0;
    const vOrders = orders.filter(o => o.orderStatus === 'delivered' && o.subOrders?.some(s => String(s.vendor) === String(v._id)));
    for (const o of vOrders) {
      for (const s of o.subOrders.filter(s => String(s.vendor) === String(v._id))) {
        balance += s.vendorEarnings;
        await VendorLedger.create({ vendor: v._id, type: 'sale_credit', amount: s.vendorEarnings, balanceAfter: balance, note: `Dummy sale ${o.orderNumber}` });
        balance -= s.commissionAmount;
        await VendorLedger.create({ vendor: v._id, type: 'commission_debit', amount: -s.commissionAmount, balanceAfter: balance, note: `Commission ${o.orderNumber}` });
      }
    }
    if (balance > 0) {
      const payoutAmt = Math.round(balance * 0.7);
      const payout = await Payout.create({
        tenant: tenant._id, vendor: v._id, amount: payoutAmt,
        commissionDeducted: 0, netAmount: payoutAmt, status: 'completed',
        utrNumber: `UTR${randInt(100000000000, 999999999999)}`,
        periodStart: daysAgo(60), periodEnd: daysAgo(1),
        processedAt: daysAgo(1), processedBy: admin?._id, notes: 'Dummy settlement payout',
      });
      balance -= payoutAmt;
      await VendorLedger.create({ vendor: v._id, type: 'payout_debit', amount: -payoutAmt, balanceAfter: balance, reference: { payout: payout._id }, note: 'Dummy payout' });
    }
  }
  // Return + refund requests tied to real orders
  for (const o of orders.filter(o => o.orderStatus === 'returned')) {
    const l = o.items[0];
    await ReturnRequest.create({
      order: o._id, user: o.user, type: 'return', status: 'refunded',
      reason: pick(['Size does not fit', 'Color differs from photos', 'Quality not as expected']),
      items: [{ orderItemId: l._id, product: l.product, price: l.price, quantity: 1, amount: l.price }],
      requestedAmount: l.price, approvedAmount: l.price, reviewedBy: admin?._id, reviewedAt: o.createdAt,
      statusHistory: [{ to: 'approved', note: 'Dummy approval' }, { to: 'refunded', note: 'Refund issued' }],
    });
  }
  for (const o of orders.filter(o => o.orderStatus === 'refunded')) {
    await RefundRequest.create({
      order: o._id, user: o.user, type: 'return', status: 'processed',
      amount: o.total, approvedAmount: o.total,
      reason: 'Product returned and received at warehouse',
      reviewedBy: admin?._id, reviewedAt: o.createdAt, processedAt: o.createdAt,
    });
  }
  const cancelledOne = orders.find(o => o.orderStatus === 'cancelled');
  if (cancelledOne) {
    await RefundRequest.create({
      order: cancelledOne._id, user: cancelledOne.user, type: 'cancellation', status: 'approved',
      amount: cancelledOne.total, approvedAmount: cancelledOne.total,
      reason: 'Order cancelled before dispatch', reviewedBy: admin?._id, reviewedAt: cancelledOne.createdAt,
    });
  }
  // Support tickets
  const ticketDefs = [
    ['Where is my order?', 'order', 'normal', 'open', 0],
    ['Refund not received yet', 'payment', 'high', 'in_progress', 1],
    ['Wrong size delivered', 'shipping', 'high', 'waiting_customer', 2],
    ['How do I use my gift card?', 'general', 'low', 'resolved', 3],
    ['Product question about warranty', 'product', 'normal', 'closed', 4],
    ['Return pickup delayed', 'return', 'urgent', 'open', 5],
  ];
  const ticketOrders = orders.slice(0, 6);
  for (let i = 0; i < ticketDefs.length; i++) {
    const [subject, category, priority, status, ui] = ticketDefs[i];
    await SupportTicket.create({
      tenant: tenant._id, ticketNumber: `TCK-${String(i + 1).padStart(5, '0')}`,
      user: users[ui]._id, author: users[ui]._id, authorRole: 'customer',
      subject, category, priority, status,
      body: `${subject} — dummy support request for platform demonstration.`,
      order: ticketOrders[i]._id,
      messages: [
        { author: users[ui]._id, authorRole: 'customer', body: `${subject} Please help.` },
        ...(admin && ['in_progress', 'waiting_customer', 'resolved', 'closed'].includes(status)
          ? [{ author: admin._id, authorRole: 'admin', body: 'Thanks for reaching out — we are looking into this for you.' }] : []),
      ],
    });
  }
  // Abandoned carts
  for (let i = 0; i < 5; i++) {
    const p = products[(i * 13) % products.length];
    const gross = p.price * (i % 2 + 1);
    await AbandonedCart.create({
      tenant: tenant._id, user: i < 3 ? users[i + 8]._id : null,
      sessionId: `abandoned-sess-${i + 1}`,
      items: [{ product: p._id, title: p.title, thumbnail: p.thumbnail, price: p.price, quantity: i % 2 + 1 }],
      itemCount: i % 2 + 1, subtotal: gross,
      lastActivity: daysAgo(randInt(0, 6)), recovered: i === 0, recoveredAt: i === 0 ? new Date() : undefined,
      device: pick(['mobile', 'desktop']),
    });
  }
  console.log('Operations data seeded');
}

async function verify() {
  console.log('--- Verification ---');
  const errors = [];
  const M = {
    carts: Cart, questions: ProductQuestion, priceAlerts: PriceDropAlert, stockAlerts: StockAlert,
    refCodes: ReferralCode, refTracking: ReferralTracking, loyaltyAccounts: LoyaltyAccount,
    loyaltyTx: LoyaltyTransaction, wallets: CustomerWallet, walletTx: WalletTransaction,
    giftCards: GiftCard, coupons: Coupon, campaigns: Campaign, priceRules: PriceRule,
    blogCats: BlogCategory, blogs: Blog, subscribers: NewsletterSubscriber,
    notifications: Notification, userNotifications: UserNotification,
    segments: CustomerSegment, recRules: ProductRecommendationRule,
    affiliateProfiles: AffiliateProfile, warehouses: Warehouse, whInventory: WarehouseInventory,
    shipments: Shipment, shipmentEvents: ShipmentEvent, payTx: PaymentTransaction,
    invoices: Invoice, ledger: VendorLedger, payouts: Payout,
    returns: ReturnRequest, refunds: RefundRequest, tickets: SupportTicket, abandoned: AbandonedCart,
  };
  const counts = {};
  for (const [k, model] of Object.entries(M)) counts[k] = await model.countDocuments();
  console.log(counts);
  const expect = {
    carts: 8, questions: 30, priceAlerts: 12, stockAlerts: 12, refCodes: 10,
    giftCards: 6, coupons: 12, campaigns: 3, priceRules: 3, blogCats: 3, blogs: 6,
    subscribers: 20, notifications: 4, segments: 3, warehouses: 2, whInventory: 200,
    shipments: 20, invoices: 12, payouts: 2, returns: 2, refunds: 3, tickets: 6, abandoned: 5,
  };
  for (const [k, v] of Object.entries(expect)) {
    if (counts[k] !== v) errors.push(`${k}=${counts[k]} expected ${v}`);
  }
  const paidCount = await Order.countDocuments({ paymentStatus: 'paid' });
  const refundedCount = await Order.countDocuments({ paymentStatus: 'refunded' });
  if (counts.payTx < paidCount + refundedCount) errors.push(`payTx=${counts.payTx} below ${paidCount + refundedCount}`);
  const productIds = new Set(DB.products.map(p => String(p._id)));
  for (const q of await ProductQuestion.find().lean()) {
    if (!productIds.has(String(q.product))) errors.push('question with bad product');
    if (!q.answers?.length) errors.push('question without answers');
  }
  for (const s of await Shipment.find().lean()) {
    if (!s.trackingNumber) errors.push('shipment without tracking');
  }
  for (const t of await SupportTicket.find().lean()) {
    if (!t.messages?.length) errors.push(`ticket ${t.ticketNumber} without messages`);
  }
  if (errors.length) {
    console.error(`VERIFY FAILED (${errors.length}):`);
    errors.slice(0, 30).forEach(e => console.error(' -', e));
    process.exit(1);
  }
  console.log('Platform seed complete — all checks passed.');
}

async function main() {
  if (!MONGO_URI) throw new Error('No MONGO_URI configured in .env');
  await mongoose.connect(MONGO_URI);
  console.log(`Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  await loadBase();
  const dropTargets = [Cart, AbandonedCart, ProductQuestion, PriceDropAlert, StockAlert,
    ReferralCode, ReferralTracking, LoyaltyProgram, LoyaltyAccount, LoyaltyTransaction,
    CustomerWallet, WalletTransaction, GiftCard, Campaign, PriceRule, BlogCategory, Blog,
    NewsletterSubscriber, Notification, UserNotification, CustomerSegment,
    CustomerSegmentMembership, ProductRecommendationRule, AffiliateProgram, AffiliateProfile,
    Warehouse, WarehouseInventory, Shipment, ShipmentEvent, PaymentTransaction, Invoice,
    VendorLedger, Payout, ReturnRequest, RefundRequest, SupportTicket];
  await Promise.all(dropTargets.map(async (Mdl) => {
    try { await Mdl.collection.drop(); } catch (_) {}
  }));
  await seedShopper();
  await seedMarketing();
  await seedOperations();
  await verify();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('Seed failed:', err); process.exit(1); });


