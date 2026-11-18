require('dotenv').config();

const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const ClickEvent = require('../models/ClickEvent');

const MONGO_URI = process.env.MONGO_URI_SEED || process.env.MONGO_URI;
const DUMMY_ORDER_PREFIX = 'DUMMY-ORDER-';
const DUMMY_SESSION_PREFIX = 'dummy-order-session-';

const scenarios = [
  { status: 'confirmed', paymentMethod: 'razorpay', paymentStatus: 'paid', source: 'google', medium: 'cpc', campaign: 'summer-demo', term: 'everyday tee', content: 'hero-banner', landingPage: '/collections/apparel', referrer: 'https://www.google.com/' },
  { status: 'processing', paymentMethod: 'razorpay', paymentStatus: 'paid', source: 'meta', medium: 'paid_social', campaign: 'retargeting-demo', term: 'hoodie', content: 'carousel-1', landingPage: '/collections/fashion', referrer: 'https://www.facebook.com/' },
  { status: 'packed', paymentMethod: 'cod', paymentStatus: 'pending', source: 'instagram', medium: 'social', campaign: 'creator-demo', term: 'runner', content: 'reel-7', landingPage: '/products/stride-runner', referrer: 'https://www.instagram.com/' },
  { status: 'ready_to_ship', paymentMethod: 'cod', paymentStatus: 'pending', source: 'email', medium: 'email', campaign: 'welcome-demo', term: 'new arrivals', content: 'cta', landingPage: '/new-arrivals', referrer: 'https://mail.example.test/' },
  { status: 'pending', paymentMethod: 'cod', paymentStatus: 'pending', source: 'direct', medium: 'none', campaign: '', term: '', content: '', landingPage: '/', referrer: '' },
  { status: 'processing', paymentMethod: 'upi', paymentStatus: 'paid', source: 'youtube', medium: 'video', campaign: 'launch-demo', term: 'denim jacket', content: 'description-link', landingPage: '/collections/denim', referrer: 'https://www.youtube.com/' },
  { status: 'shipped', paymentMethod: 'razorpay', paymentStatus: 'paid', source: 'affiliate', medium: 'referral', campaign: 'partner-demo', term: 'best sellers', content: 'partner-link', landingPage: '/collections/bestsellers', referrer: 'https://partner.example.test/' },
  { status: 'out_for_delivery', paymentMethod: 'cashfree', paymentStatus: 'paid', source: 'bing', medium: 'organic', campaign: 'seo-demo', term: 'fashion', content: 'search', landingPage: '/search?q=fashion', referrer: 'https://www.bing.com/' },
  { status: 'delivered', paymentMethod: 'razorpay', paymentStatus: 'paid', source: 'google', medium: 'organic', campaign: 'brand-demo', term: 'tatoz', content: 'knowledge-panel', landingPage: '/about', referrer: 'https://www.google.com/' },
  { status: 'cancelled', paymentMethod: 'cod', paymentStatus: 'refunded', source: 'whatsapp', medium: 'messaging', campaign: 'broadcast-demo', term: 'offer', content: 'catalogue', landingPage: '/offers', referrer: 'https://wa.me/' },
  { status: 'returned', paymentMethod: 'cod', paymentStatus: 'refunded', source: 'direct', medium: 'none', campaign: '', term: '', content: '', landingPage: '/orders', referrer: '' },
  { status: 'ready_to_ship', paymentMethod: 'cod', paymentStatus: 'pending', source: 'google', medium: 'shopping', campaign: 'shiprocket-demo', term: 'courier options', content: 'shipping-card', landingPage: '/shipping', referrer: 'https://www.google.com/shopping/' },
];

const pincodeByIndex = ['302001', '110001', '400001', '560001', '700001', '500001'];

const money = value => Math.round((Number(value) || 0) * 100) / 100;

const buildUtm = scenario => ({
  utm_source: scenario.source,
  utm_medium: scenario.medium,
  utm_campaign: scenario.campaign,
  utm_term: scenario.term,
  utm_content: scenario.content,
  source: scenario.source,
  medium: scenario.medium,
  campaign: scenario.campaign,
  term: scenario.term,
  content: scenario.content,
  landingPage: scenario.landingPage,
  firstPage: scenario.landingPage,
  lastPage: '/checkout',
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  referrer: scenario.referrer,
});

const buildAddress = (user, index) => ({
  fullName: `${user.name || 'Demo Customer'} (Dummy)`,
  phone: user.phone || `+91981000${String(1000 + index).slice(-4)}`,
  street: `${10 + index}, Demo Commerce Road`,
  city: ['Jaipur', 'New Delhi', 'Mumbai', 'Bengaluru', 'Kolkata', 'Hyderabad'][index % 6],
  state: ['Rajasthan', 'Delhi', 'Maharashtra', 'Karnataka', 'West Bengal', 'Telangana'][index % 6],
  pincode: pincodeByIndex[index % pincodeByIndex.length],
  country: 'India',
});

const eventRowsFor = ({ tenantId, userId, sessionId, order, scenario, product, createdAt }) => {
  const base = {
    tenant: tenantId,
    userId,
    sessionId,
    userAgent: 'DummyOrderSeeder/1.0',
    device: 'desktop',
    referrer: scenario.referrer || undefined,
  };
  const utm = buildUtm(scenario);
  const rows = [
    { eventType: 'page_view', page: scenario.landingPage, metadata: { attribution: utm } },
    { eventType: 'product_click', page: `/products/${product.slug || product._id}`, target: product.title, targetId: String(product._id), metadata: { attribution: utm } },
    { eventType: 'add_to_cart', page: `/products/${product.slug || product._id}`, target: product.title, targetId: String(product._id), metadata: { attribution: utm } },
    { eventType: 'checkout_start', page: '/checkout', metadata: { attribution: utm } },
    { eventType: 'order_placed', page: `/order-confirmation/${order._id}`, target: order.orderNumber, targetId: String(order._id), metadata: { orderId: String(order._id), orderNumber: order.orderNumber, total: order.total, utm } },
  ];
  return rows.map((row, index) => ({
    ...base,
    ...row,
    createdAt: new Date(createdAt.getTime() - ((rows.length - index) * 45 * 1000)),
    updatedAt: new Date(createdAt.getTime() - ((rows.length - index) * 45 * 1000)),
  }));
};

async function main() {
  if (!MONGO_URI) throw new Error('MONGO_URI is not configured');
  await mongoose.connect(MONGO_URI);

  const tenant = await Tenant.findOne({ key: process.env.DUMMY_TENANT_KEY || 'platform', status: { $ne: 'archived' } }).lean();
  if (!tenant) throw new Error('Active platform tenant not found');

  const users = await User.find({ role: 'customer', isActive: true }).sort({ createdAt: 1 }).limit(20).lean();
  if (!users.length) throw new Error('At least one active customer is required');

  const products = await Product.find({
    tenant: tenant._id,
    lifecycleStatus: 'active',
    approvalStatus: { $ne: 'rejected' },
  }).sort({ createdAt: 1 }).limit(Math.max(scenarios.length, 5)).lean();
  if (!products.length) throw new Error('At least one active tenant product is required');

  await Order.deleteMany({ tenant: tenant._id, orderNumber: { $regex: `^${DUMMY_ORDER_PREFIX}` } });
  await ClickEvent.deleteMany({ tenant: tenant._id, sessionId: { $regex: `^${DUMMY_SESSION_PREFIX}` } });

  const now = Date.now();
  const orders = [];
  const events = [];

  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    const user = users[index % users.length];
    const product = products[index % products.length];
    const quantity = (index % 3) + 1;
    const price = money(product.price || 999);
    const subtotal = money(price * quantity);
    const shippingCost = index % 3 === 0 ? 0 : 79;
    const discount = index % 4 === 0 ? 100 : index % 4 === 1 ? 150 : 0;
    const taxableAmount = money(Math.max(0, subtotal + shippingCost - discount));
    const tax = money(taxableAmount * 0.05);
    const total = money(taxableAmount + tax);
    const createdAt = new Date(now - (index * 3 * 60 * 60 * 1000));
    const orderNumber = `${DUMMY_ORDER_PREFIX}${String(index + 1).padStart(2, '0')}-${String(now).slice(-6)}`;
    const sessionId = `${DUMMY_SESSION_PREFIX}${String(index + 1).padStart(2, '0')}-${String(now).slice(-6)}`;
    const paid = scenario.paymentStatus === 'paid';
    const awb = ['shipped', 'out_for_delivery', 'delivered'].includes(scenario.status) ? `DUMMY-AWB-${String(index + 1).padStart(3, '0')}` : '';
    const courierName = awb ? ['Delhivery', 'Blue Dart', 'DTDC'][index % 3] : '';
    const address = buildAddress(user, index);
    const utm = buildUtm(scenario);
    const productImage = product.thumbnail || product.images?.[0]?.url || '';
    const item = {
      itemType: 'product',
      product: product._id,
      title: product.title,
      image: productImage,
      price,
      costPrice: Number(product.costPrice || 0),
      costPriceCaptured: true,
      quantity,
      variant: {},
      sku: product.sku || `DUMMY-SKU-${index + 1}`,
      hsnCode: product.hsnCode || '',
      taxRate: 5,
      taxableAmount,
      taxAmount: tax,
    };

    const order = new Order({
      tenant: tenant._id,
      orderNumber,
      user: user._id,
      items: [item],
      shippingAddress: address,
      billingAddress: address,
      paymentMethod: scenario.paymentMethod,
      paymentStatus: scenario.paymentStatus,
      paymentProvider: paid ? scenario.paymentMethod : '',
      paymentVerifiedAt: paid ? createdAt : undefined,
      orderStatus: scenario.status,
      returnStatus: scenario.status === 'returned' ? 'closed' : 'none',
      subtotal,
      shippingCost,
      tax,
      taxableAmount,
      cgst: tax / 2,
      sgst: tax / 2,
      discount,
      total,
      amountPaid: paid ? total : 0,
      amountDue: paid ? 0 : total,
      inventoryStatus: 'legacy',
      referralSource: scenario.source,
      utm,
      trackingSessionId: sessionId,
      shippingMethod: 'standard',
      shippingQuote: { provider: 'shiprocket', serviceable: true, estimatedMinDays: 2, estimatedMaxDays: 6, dummy: true },
      trackingNumber: awb || `DUMMY-TRACK-${String(index + 1).padStart(3, '0')}`,
      shippingProvider: awb ? 'demo' : 'shiprocket',
      shippingStatus: scenario.status === 'delivered' ? 'delivered' : awb ? 'in_transit' : 'created',
      awbCode: awb || undefined,
      courierName: courierName || undefined,
      courierCompanyId: awb ? 9000 + index : undefined,
      shiprocketStatus: awb ? 'DUMMY_STATUS' : undefined,
      estimatedDelivery: new Date(createdAt.getTime() + 6 * 24 * 60 * 60 * 1000),
      deliveredAt: scenario.status === 'delivered' ? new Date(createdAt.getTime() + 4 * 24 * 60 * 60 * 1000) : undefined,
      cancelledAt: scenario.status === 'cancelled' ? new Date(createdAt.getTime() + 60 * 60 * 1000) : undefined,
      customerNote: 'Dummy order seeded for Orders panel QA',
      adminNote: 'DUMMY DATA — safe to remove with seedDummyOrders.js',
      statusHistory: [{ status: scenario.status, note: 'Dummy order seeded for Orders panel QA', updatedBy: user._id, updatedAt: createdAt }],
      createdAt,
      updatedAt: createdAt,
    });

    await order.save({ timestamps: false });
    orders.push(order);
    events.push(...eventRowsFor({ tenantId: tenant._id, userId: user._id, sessionId, order, scenario, product, createdAt }));
  }

  await ClickEvent.insertMany(events, { ordered: true });
  const statusCounts = orders.reduce((result, order) => {
    result[order.orderStatus] = (result[order.orderStatus] || 0) + 1;
    return result;
  }, {});

  console.log(JSON.stringify({
    success: true,
    tenant: tenant.name,
    ordersSeeded: orders.length,
    eventsSeeded: events.length,
    statusCounts,
    orderPrefix: DUMMY_ORDER_PREFIX,
    shipNowReady: orders.filter(order => ['confirmed', 'processing', 'packed', 'ready_to_ship'].includes(order.orderStatus) && !order.awbCode).length,
  }, null, 2));
}

main()
  .catch(error => {
    console.error(`Dummy order seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
