const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Review = require('../models/Review');
const RefundRequest = require('../models/RefundRequest');
const InventoryLog = require('../models/InventoryLog');
const ClickEvent = require('../models/ClickEvent');
const Conversation = require('../models/Conversation');
const AIUsage = require('../models/AIUsage');
const Vendor = require('../models/Vendor');
const Payout = require('../models/Payout');
const Coupon = require('../models/Coupon');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const Notification = require('../models/Notification');
const ReferralCode = require('../models/ReferralCode');
const ReferralTracking = require('../models/ReferralTracking');
const Page = require('../models/Page');
const Blog = require('../models/Blog');
const Integration = require('../models/Integration');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceJob = require('../models/MarketplaceJob');
const IntegrationConnection = require('../models/IntegrationConnection');
const MarketplaceListing = require('../models/MarketplaceListing');
const MarketplaceOrder = require('../models/MarketplaceOrder');
const { buildTenantAnalyticsScope, withTenant, withTenantUsers, withTenantVendors } = require('../services/tenantAnalyticsScope');

const MAX_RANGE_DAYS = 365;
const ROW_LIMIT = 12;

const number = value => Number(value || 0);
const sum = (rows, key) => rows.reduce((total, row) => total + number(row[key]), 0);
const label = value => String(value || 'Unknown').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const metric = (name, value, caption = '', format = 'number', tone = 'indigo') => ({ name, value: number(value), caption, format, tone });

const table = (title, columns, rows) => ({ type: 'table', title, columns, rows: Array.isArray(rows) ? rows : [] });
const bars = (title, rows, valueLabel = 'Count', format = 'number') => ({
  type: 'bars',
  title,
  valueLabel,
  format,
  rows: (rows || []).map(row => ({ label: label(row.label ?? row._id), value: number(row.value ?? row.count), secondary: row.secondary }))
});
const trend = (title, rows, format = 'number') => ({
  type: 'trend',
  title,
  format,
  rows: (rows || []).map(row => ({ label: row.label ?? row._id, value: number(row.value ?? row.count), secondary: row.secondary }))
});

const validDate = (value, endOfDay = false) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getWindow = (query, scope = {}) => {
  const now = new Date();
  const end = validDate(query.endDate, true) || now;
  let start = validDate(query.startDate) || new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const oldestAllowed = new Date(end.getTime() - (MAX_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);
  if (start < oldestAllowed) start = oldestAllowed;
  if (start > end) {
    const fallback = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    start = fallback < oldestAllowed ? oldestAllowed : fallback;
  }
  return {
    start,
    end,
    scope,
    // Most analytics collections carry tenant directly. Keeping the tenant
    // predicate in the shared date match makes it difficult for a new chart
    // to accidentally fall back to a platform-wide query.
    match: withTenant(scope, { createdAt: { $gte: start, $lte: end } }),
    days: Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1),
    label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
  };
};

const dateFormat = days => days > 92 ? '%Y-%m' : '%Y-%m-%d';
const dateTrend = (rows, valueKey = 'value', secondaryKey = 'secondary') => rows.map(row => ({ label: row._id, value: number(row[valueKey]), secondary: secondaryKey ? number(row[secondaryKey]) : undefined }));
const orderSelect = 'orderNumber orderStatus paymentStatus paymentMethod subtotal shippingCost tax discount total couponCode referralCode shippingMethod trackingNumber awbCode courierName shiprocketStatus createdAt user';

const withOrderUser = order => ({
  id: order._id,
  order: order.orderNumber,
  customer: order.user?.name || order.user?.email || 'Guest',
  status: label(order.orderStatus),
  payment: label(order.paymentStatus),
  method: label(order.paymentMethod),
  total: number(order.total),
  createdAt: order.createdAt,
});

const baseResponse = (operation, window, metrics, sections, note = '') => ({
  success: true,
  tenantScoped: Boolean(window.scope?.tenantId),
  operation,
  generatedAt: new Date().toISOString(),
  range: { startDate: window.start.toISOString().slice(0, 10), endDate: window.end.toISOString().slice(0, 10), days: window.days, label: window.label },
  metrics,
  sections,
  note,
});

const getSalesAnalytics = async window => {
  const paidMatch = { ...window.match, paymentStatus: 'paid' };
  const [overview, statusRows, methodRows, dailyRows, categoryRows, productRows, recentOrders] = await Promise.all([
    Order.aggregate([{ $match: window.match }, { $group: { _id: null, orders: { $sum: 1 }, gross: { $sum: '$total' }, paidRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } }, discount: { $sum: '$discount' }, shipping: { $sum: '$shippingCost' }, tax: { $sum: '$tax' } } }]),
    Order.aggregate([{ $match: window.match }, { $group: { _id: '$orderStatus', count: { $sum: 1 }, amount: { $sum: '$total' } } }, { $sort: { count: -1 } }]),
    Order.aggregate([{ $match: window.match }, { $group: { _id: '$paymentMethod', count: { $sum: 1 }, amount: { $sum: '$total' } } }, { $sort: { amount: -1 } }]),
    Order.aggregate([{ $match: paidMatch }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $match: paidMatch }, { $unwind: '$items' }, { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } }, { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }, { $lookup: { from: 'categories', localField: 'product.category', foreignField: '_id', as: 'category' } }, { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }, { $group: { _id: { $ifNull: ['$category.name', 'Uncategorized'] }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }, units: { $sum: '$items.quantity' } } }, { $sort: { revenue: -1 } }, { $limit: ROW_LIMIT }]),
    Order.aggregate([{ $match: paidMatch }, { $unwind: '$items' }, { $group: { _id: '$items.product', units: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } }, { $sort: { revenue: -1 } }, { $limit: ROW_LIMIT }, { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } }, { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }, { $project: { _id: 0, product: { $ifNull: ['$product.title', 'Deleted product'] }, units: 1, revenue: 1 } }]),
    Order.find(window.match).sort({ createdAt: -1 }).limit(ROW_LIMIT).select(orderSelect).populate('user', 'name email').lean(),
  ]);
  const o = overview[0] || {};
  const codOrders = methodRows.find(row => row._id === 'cod')?.count || 0;
  return baseResponse('sales', window, [
    metric('Gross order value', o.gross, 'All orders in selected period', 'currency', 'indigo'),
    metric('Paid revenue', o.paidRevenue, 'Captured order value', 'currency', 'emerald'),
    metric('Orders', o.orders, 'All order records', 'number', 'blue'),
    metric('Average order value', o.orders ? o.gross / o.orders : 0, 'Gross value per order', 'currency', 'amber'),
    metric('Discounts', o.discount, 'Discount value applied', 'currency', 'rose'),
    metric('Shipping collected', o.shipping, 'Shipping charges', 'currency', 'violet'),
  ], [
    trend('Revenue and order trend', dateTrend(dailyRows, 'revenue', 'orders'), 'currency'),
    bars('Orders by status', statusRows.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Orders'),
    bars('Payment methods', methodRows.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Orders'),
    table('Top categories', [{ key: 'label', label: 'Category' }, { key: 'units', label: 'Units' }, { key: 'revenue', label: 'Revenue', format: 'currency' }], categoryRows.map(row => ({ label: row._id, units: number(row.units), revenue: number(row.revenue) }))),
    table('Top products', [{ key: 'product', label: 'Product' }, { key: 'units', label: 'Units' }, { key: 'revenue', label: 'Revenue', format: 'currency' }], productRows.map(row => ({ product: row.product, units: number(row.units), revenue: number(row.revenue) }))),
    table('Recent orders', [{ key: 'order', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'Total', format: 'currency' }, { key: 'createdAt', label: 'Created', format: 'date' }], recentOrders.map(withOrderUser)),
  ], `Paid orders are identified by paymentStatus=paid. ${codOrders ? `${codOrders} COD orders are included in the method breakdown.` : ''}`);
};

const PROFIT_PAYMENT_STATUSES = ['paid', 'refunded', 'partially_refunded'];

const getProfitAnalytics = async window => {
  const orders = await Order.find({ ...window.match, paymentStatus: { $in: PROFIT_PAYMENT_STATUSES } })
    .select('orderNumber paymentStatus subtotal discount refundTotal items createdAt')
    .lean();
  const productIds = orders.flatMap(order => (order.items || []).map(item => item.product).filter(Boolean));
  const products = productIds.length
    ? await Product.find(withTenant(window.scope, { _id: { $in: productIds } })).select('title costPrice').lean()
    : [];
  const productById = new Map(products.map(product => [String(product._id), product]));
  const contributionByProduct = new Map();
  const trendByDate = new Map();
  let merchandiseSales = 0;
  let cogs = 0;
  let refunds = 0;
  let units = 0;
  let capturedUnits = 0;

  orders.forEach(order => {
    const lines = order.items || [];
    const itemGross = lines.reduce((total, item) => total + number(item.price) * number(item.quantity), 0);
    const discountRatio = itemGross > 0 ? Math.min(1, Math.max(0, number(order.discount) / itemGross)) : 0;
    let orderProfit = 0;
    lines.forEach(item => {
      const quantity = Math.max(0, number(item.quantity));
      const gross = number(item.price) * quantity;
      const revenue = gross * (1 - discountRatio);
      const product = productById.get(String(item.product));
      const captured = item.costPriceCaptured === true && item.costPrice !== null && item.costPrice !== undefined;
      const unitCost = captured ? Math.max(0, number(item.costPrice)) : Math.max(0, number(product?.costPrice));
      const lineCogs = unitCost * quantity;
      const key = String(item.product || 'unknown');
      const existing = contributionByProduct.get(key) || { product: product?.title || item.title || 'Deleted product', units: 0, revenue: 0, cogs: 0, estimatedUnits: 0 };
      existing.units += quantity;
      existing.revenue += revenue;
      existing.cogs += lineCogs;
      if (!captured) existing.estimatedUnits += quantity;
      contributionByProduct.set(key, existing);
      merchandiseSales += revenue;
      cogs += lineCogs;
      units += quantity;
      if (captured) capturedUnits += quantity;
      orderProfit += revenue - lineCogs;
    });
    refunds += Math.max(0, number(order.refundTotal));
    const dateKey = new Date(order.createdAt).toISOString().slice(0, window.days > 92 ? 7 : 10);
    const existingTrend = trendByDate.get(dateKey) || { _id: dateKey, value: 0, secondary: 0 };
    existingTrend.value += orderProfit;
    existingTrend.secondary += 1;
    trendByDate.set(dateKey, existingTrend);
  });

  const grossProfit = merchandiseSales - cogs;
  const realizedSales = Math.max(0, merchandiseSales - refunds);
  const realizedGrossProfit = grossProfit - refunds;
  const coverage = units ? (capturedUnits / units) * 100 : 100;
  const topProducts = [...contributionByProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, ROW_LIMIT);
  return baseResponse('profit', window, [
    metric('Merchandise sales', merchandiseSales, 'Paid merchandise after order discounts, before tax and shipping', 'currency', 'indigo'),
    metric('COGS', cogs, 'Cost of goods sold from checkout snapshots or explicit legacy fallback', 'currency', 'rose'),
    metric('Gross profit', grossProfit, 'Merchandise sales minus COGS', 'currency', grossProfit >= 0 ? 'emerald' : 'rose'),
    metric('Gross margin', merchandiseSales ? (grossProfit / merchandiseSales) * 100 : 0, 'Gross profit ÷ merchandise sales', 'percent', 'blue'),
    metric('Refunds', refunds, 'Refund totals recorded on paid orders', 'currency', 'amber'),
    metric('Realized gross profit', realizedGrossProfit, 'Gross profit after recorded refunds', 'currency', realizedGrossProfit >= 0 ? 'emerald' : 'rose'),
    metric('Cost coverage', coverage, `${capturedUnits} of ${units} units use checkout cost snapshots`, 'percent', coverage >= 99.99 ? 'emerald' : 'amber'),
    metric('Realized margin', realizedSales ? (realizedGrossProfit / realizedSales) * 100 : 0, 'Realized gross profit ÷ sales after refunds', 'percent', 'violet'),
  ], [
    trend('Profit trend', [...trendByDate.values()].sort((a, b) => a._id.localeCompare(b._id)), 'currency'),
    table('Product profit contribution', [
      { key: 'product', label: 'Product' },
      { key: 'units', label: 'Units' },
      { key: 'revenue', label: 'Sales', format: 'currency' },
      { key: 'cogs', label: 'COGS', format: 'currency' },
      { key: 'profit', label: 'Profit', format: 'currency' },
      { key: 'estimatedUnits', label: 'Estimated units' },
    ], topProducts.map(row => ({ ...row, profit: row.revenue - row.cogs }))),
  ], `Profit reporting is tenant-scoped. Cost coverage is ${coverage.toFixed(1)}%; legacy lines without a checkout snapshot use the current tenant product cost and are marked estimated.`);
};

const getCustomerAnalytics = async window => {
  const customerMatch = withTenantUsers(window.scope, { role: 'customer' });
  const [total, newCustomers, activeCustomers, verified, googleUsers, segments, growth, topCustomers] = await Promise.all([
    User.countDocuments(customerMatch),
    User.countDocuments({ ...customerMatch, createdAt: window.match.createdAt }),
    User.countDocuments({ ...customerMatch, lastLogin: window.match.createdAt }),
    User.countDocuments({ ...customerMatch, isEmailVerified: true }),
    User.countDocuments({ ...customerMatch, googleId: { $exists: true, $nin: [null, ''] } }),
    User.aggregate([{ $match: customerMatch }, { $group: { _id: '$segment', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    User.aggregate([{ $match: { ...customerMatch, createdAt: window.match.createdAt } }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    User.find(customerMatch).sort({ totalSpent: -1 }).limit(ROW_LIMIT).select('name email segment orderCount totalSpent lastOrderAt createdAt').lean(),
  ]);
  return baseResponse('customers', window, [
    metric('Total customers', total, 'Current customer accounts', 'number', 'indigo'),
    metric('New customers', newCustomers, 'Registered in selected period', 'number', 'emerald'),
    metric('Active customers', activeCustomers, 'Logged in during selected period', 'number', 'blue'),
    metric('Verified email', verified, 'Customer accounts verified', 'number', 'violet'),
    metric('Google sign-ins', googleUsers, 'Accounts linked to Google', 'number', 'amber'),
    metric('Repeat customers', topCustomers.filter(customer => number(customer.orderCount) > 1).length, 'Visible top-spender sample with 2+ orders', 'number', 'rose'),
  ], [
    trend('Customer registrations', dateTrend(growth, 'count', null)),
    bars('Customer segments', segments.map(row => ({ label: row._id, value: row.count })), 'Customers'),
    table('Highest customer lifetime value', [{ key: 'name', label: 'Customer' }, { key: 'email', label: 'Email' }, { key: 'segment', label: 'Segment' }, { key: 'orderCount', label: 'Orders' }, { key: 'totalSpent', label: 'Spent', format: 'currency' }], topCustomers.map(row => ({ name: row.name || 'Unnamed', email: row.email || '—', segment: label(row.segment), orderCount: number(row.orderCount), totalSpent: number(row.totalSpent) }))),
  ], 'Customer activity is based on account fields and login timestamps stored by the platform.');
};

const getCatalogAnalytics = async window => {
  const [total, active, featured, flashDeals, lowStock, outOfStock, seoReady, created, categories, brands, topViewed, topSelling] = await Promise.all([
    Product.countDocuments(withTenant(window.scope)),
    Product.countDocuments(withTenant(window.scope, { isActive: true })),
    Product.countDocuments(withTenant(window.scope, { isActive: true, isFeatured: true })),
    Product.countDocuments(withTenant(window.scope, { isActive: true, isFlashDeal: true, flashDealExpiry: { $gte: new Date() } })),
    Product.countDocuments(withTenant(window.scope, { isActive: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] }, stock: { $gt: 0 } })),
    Product.countDocuments(withTenant(window.scope, { isActive: true, stock: { $lte: 0 } })),
    Product.countDocuments(withTenant(window.scope, { isActive: true, 'seo.metaTitle': { $nin: [null, ''] }, 'seo.metaDescription': { $nin: [null, ''] } })),
    Product.aggregate([{ $match: withTenant(window.scope, { createdAt: window.match.createdAt }) }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Product.aggregate([{ $match: withTenant(window.scope, { isActive: true }) }, { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } }, { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }, { $group: { _id: { $ifNull: ['$category.name', 'Uncategorized'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: ROW_LIMIT }]),
    Product.aggregate([{ $match: withTenant(window.scope, { isActive: true }) }, { $group: { _id: { $ifNull: ['$brand', 'Unbranded'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: ROW_LIMIT }]),
    Product.find(withTenant(window.scope, { isActive: true })).sort({ views: -1 }).limit(ROW_LIMIT).select('title views totalSales stock price').lean(),
    Product.find(withTenant(window.scope, { isActive: true })).sort({ totalSales: -1 }).limit(ROW_LIMIT).select('title views totalSales stock price').lean(),
  ]);
  return baseResponse('catalog', window, [
    metric('All products', total, 'Product records', 'number', 'indigo'),
    metric('Active products', active, 'Visible on storefront', 'number', 'emerald'),
    metric('Featured products', featured, 'Featured merchandising', 'number', 'blue'),
    metric('Flash deals', flashDeals, 'Active time-bound offers', 'number', 'rose'),
    metric('Low stock', lowStock, 'Active products above zero stock', 'number', 'amber'),
    metric('SEO ready', seoReady, 'With title and description metadata', 'number', 'violet'),
  ], [
    trend('Products added', dateTrend(created, 'count', null)),
    bars('Products by category', categories.map(row => ({ label: row._id, value: row.count })), 'Products'),
    bars('Products by brand', brands.map(row => ({ label: row._id, value: row.count })), 'Products'),
    table('Most viewed products', [{ key: 'title', label: 'Product' }, { key: 'views', label: 'Views' }, { key: 'totalSales', label: 'Sales' }, { key: 'stock', label: 'Stock' }], topViewed.map(row => ({ title: row.title, views: number(row.views), totalSales: number(row.totalSales), stock: number(row.stock) }))),
    table('Best-selling products', [{ key: 'title', label: 'Product' }, { key: 'totalSales', label: 'Sales' }, { key: 'views', label: 'Views' }, { key: 'stock', label: 'Stock' }], topSelling.map(row => ({ title: row.title, totalSales: number(row.totalSales), views: number(row.views), stock: number(row.stock) }))),
  ], 'Catalog metrics describe the current catalog; the trend is limited to products created in the selected period.');
};

const getInventoryAnalytics = async window => {
  const [stockSummary, movementTypes, movementTrend, lowStock, recentLogs] = await Promise.all([
    Product.aggregate([{ $match: withTenant(window.scope, { isActive: true }) }, { $group: { _id: null, products: { $sum: 1 }, units: { $sum: '$stock' }, stockValue: { $sum: { $multiply: ['$stock', '$price'] } }, low: { $sum: { $cond: [{ $lte: ['$stock', '$lowStockThreshold'] }, 1, 0] } }, out: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } } } }]),
    InventoryLog.aggregate([{ $match: window.match }, { $group: { _id: '$type', changes: { $sum: 1 }, delta: { $sum: '$delta' } } }, { $sort: { changes: -1 } }]),
    InventoryLog.aggregate([{ $match: window.match }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, changes: { $sum: 1 }, delta: { $sum: '$delta' } } }, { $sort: { _id: 1 } }]),
    Product.find(withTenant(window.scope, { isActive: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } })).sort({ stock: 1 }).limit(ROW_LIMIT).select('title stock lowStockThreshold price sku').lean(),
    InventoryLog.find(window.match).sort({ createdAt: -1 }).limit(ROW_LIMIT).populate('product', 'title sku').populate('user', 'name email').lean(),
  ]);
  const s = stockSummary[0] || {};
  return baseResponse('inventory', window, [
    metric('Tracked products', s.products, 'Active catalog products', 'number', 'indigo'),
    metric('Units in stock', s.units, 'Current available units', 'number', 'emerald'),
    metric('Stock value', s.stockValue, 'Units × current product price', 'currency', 'blue'),
    metric('Low stock', s.low, 'At or below threshold', 'number', 'amber'),
    metric('Out of stock', s.out, 'Zero or negative units', 'number', 'rose'),
    metric('Net stock movement', sum(movementTypes, 'delta'), 'Selected period inventory delta', 'number', 'violet'),
  ], [
    trend('Inventory movement', movementTrend.map(row => ({ _id: row._id, value: row.changes, secondary: row.delta }))),
    bars('Movement types', movementTypes.map(row => ({ label: row._id, value: row.changes, secondary: row.delta })), 'Changes'),
    table('Products needing stock attention', [{ key: 'title', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'stock', label: 'Stock' }, { key: 'lowStockThreshold', label: 'Threshold' }, { key: 'price', label: 'Price', format: 'currency' }], lowStock.map(row => ({ title: row.title, sku: row.sku || '—', stock: number(row.stock), lowStockThreshold: number(row.lowStockThreshold), price: number(row.price) }))),
    table('Recent inventory changes', [{ key: 'product', label: 'Product' }, { key: 'type', label: 'Type' }, { key: 'delta', label: 'Change' }, { key: 'newStock', label: 'New stock' }, { key: 'createdAt', label: 'Created', format: 'date' }], recentLogs.map(row => ({ product: row.product?.title || 'Deleted product', type: label(row.type), delta: number(row.delta), newStock: number(row.newStock), createdAt: row.createdAt }))),
  ], 'Stock balance is calculated from active Product records. Movement history depends on recorded InventoryLog entries.');
};

const getPaymentAnalytics = async window => {
  const match = window.match;
  const [statusRows, methodRows, trendRows, refundRows, failedOrders] = await Promise.all([
    Order.aggregate([{ $match: match }, { $group: { _id: '$paymentStatus', count: { $sum: 1 }, amount: { $sum: '$total' } } }, { $sort: { count: -1 } }]),
    Order.aggregate([{ $match: match }, { $group: { _id: '$paymentMethod', count: { $sum: 1 }, amount: { $sum: '$total' } } }, { $sort: { amount: -1 } }]),
    Order.aggregate([{ $match: { ...match, paymentStatus: 'paid' } }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, amount: { $sum: '$total' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    RefundRequest.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$approvedAmount', '$amount'] } } } }, { $sort: { count: -1 } }]),
    Order.find({ ...match, paymentStatus: 'failed' }).sort({ createdAt: -1 }).limit(ROW_LIMIT).select(orderSelect).populate('user', 'name email').lean(),
  ]);
  const total = sum(statusRows, 'count');
  const paid = statusRows.find(row => row._id === 'paid');
  const failed = statusRows.find(row => row._id === 'failed');
  const refunded = statusRows.filter(row => ['refunded', 'partially_refunded'].includes(row._id)).reduce((totalAmount, row) => totalAmount + number(row.amount), 0);
  return baseResponse('payments', window, [
    metric('Payment attempts', total, 'Orders created in selected period', 'number', 'indigo'),
    metric('Captured revenue', paid?.amount, 'Orders marked paid', 'currency', 'emerald'),
    metric('Successful payments', paid?.count, total ? `${((number(paid?.count) / total) * 100).toFixed(1)}% of attempts` : '0% of attempts', 'number', 'blue'),
    metric('Failed payments', failed?.count, 'Orders marked failed', 'number', 'rose'),
    metric('Refunded order value', refunded, 'Refunded or partially refunded orders', 'currency', 'amber'),
    metric('Collection rate', total ? (number(paid?.count) / total) * 100 : 0, 'Paid orders ÷ payment attempts', 'percent', 'violet'),
  ], [
    bars('Payment status', statusRows.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Orders'),
    bars('Payment method', methodRows.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Orders'),
    trend('Captured payment trend', trendRows.map(row => ({ _id: row._id, value: row.amount, secondary: row.count })), 'currency'),
    bars('Refund status', refundRows.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Requests'),
    table('Recent failed payments', [{ key: 'order', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'method', label: 'Method' }, { key: 'total', label: 'Amount', format: 'currency' }, { key: 'createdAt', label: 'Created', format: 'date' }], failedOrders.map(withOrderUser)),
  ], 'Payment analytics use local order payment status. Gateway-level events remain available in the Razorpay workspace.');
};

const getRefundAnalytics = async window => {
  const [overview, statuses, types, trendRows, returns, recent] = await Promise.all([
    RefundRequest.aggregate([{ $match: window.match }, { $group: { _id: null, requests: { $sum: 1 }, requested: { $sum: '$amount' }, approved: { $sum: { $ifNull: ['$approvedAmount', 0] } } } }]),
    RefundRequest.aggregate([{ $match: window.match }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { count: -1 } }]),
    RefundRequest.aggregate([{ $match: window.match }, { $group: { _id: '$type', count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { count: -1 } }]),
    RefundRequest.aggregate([{ $match: window.match }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $match: { ...window.match, orderStatus: { $in: ['cancelled', 'returned'] } } }, { $group: { _id: '$orderStatus', count: { $sum: 1 }, amount: { $sum: '$total' } } }]),
    RefundRequest.find(window.match).sort({ createdAt: -1 }).limit(ROW_LIMIT).select('type status amount approvedAmount reason createdAt order user').populate('order', 'orderNumber total').populate('user', 'name email').lean(),
  ]);
  const o = overview[0] || {};
  return baseResponse('refunds', window, [
    metric('Refund requests', o.requests, 'Requests created in selected period', 'number', 'indigo'),
    metric('Amount requested', o.requested, 'Requested refund value', 'currency', 'amber'),
    metric('Amount approved', o.approved, 'Approved refund value', 'currency', 'emerald'),
    metric('Pending requests', statuses.find(row => row._id === 'pending')?.count, 'Waiting for review', 'number', 'rose'),
    metric('Cancelled orders', sum(returns.filter(row => row._id === 'cancelled'), 'count'), 'Order cancellations', 'number', 'blue'),
    metric('Returned orders', sum(returns.filter(row => row._id === 'returned'), 'count'), 'Orders marked returned', 'number', 'violet'),
  ], [
    trend('Refund request trend', trendRows.map(row => ({ _id: row._id, value: row.count, secondary: row.amount }))),
    bars('Refund status', statuses.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Requests'),
    bars('Refund type', types.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Requests'),
    table('Recent refund requests', [{ key: 'type', label: 'Type' }, { key: 'status', label: 'Status' }, { key: 'amount', label: 'Requested', format: 'currency' }, { key: 'approvedAmount', label: 'Approved', format: 'currency' }, { key: 'reason', label: 'Reason' }, { key: 'createdAt', label: 'Created', format: 'date' }], recent.map(row => ({ type: label(row.type), status: label(row.status), amount: number(row.amount), approvedAmount: number(row.approvedAmount), reason: row.reason || '—', createdAt: row.createdAt }))),
  ], 'Refund request data is sourced from RefundRequest; cancellation and return counts are sourced from orders.');
};

const getShippingAnalytics = async window => {
  const shiprocketMatch = { ...window.match, shiprocketOrderId: { $exists: true, $ne: null } };
  const [total, statuses, couriers, localStatuses, trendRows, recent] = await Promise.all([
    Order.countDocuments(shiprocketMatch),
    Order.aggregate([{ $match: shiprocketMatch }, { $group: { _id: { $ifNull: ['$shiprocketStatus', 'Not synced'] }, count: { $sum: 1 }, amount: { $sum: '$total' } } }, { $sort: { count: -1 } }]),
    Order.aggregate([{ $match: shiprocketMatch }, { $group: { _id: { $ifNull: ['$courierName', 'Unassigned'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: ROW_LIMIT }]),
    Order.aggregate([{ $match: shiprocketMatch }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Order.aggregate([{ $match: shiprocketMatch }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, count: { $sum: 1 }, amount: { $sum: '$total' } } }, { $sort: { _id: 1 } }]),
    Order.find(shiprocketMatch).sort({ createdAt: -1 }).limit(ROW_LIMIT).select('orderNumber total orderStatus paymentMethod shiprocketStatus awbCode courierName pickupScheduled isReturn createdAt').lean(),
  ]);
  const statusCount = name => statuses.filter(row => String(row._id).toLowerCase().includes(name)).reduce((totalCount, row) => totalCount + number(row.count), 0);
  return baseResponse('shipping', window, [
    metric('Shipments', total, 'Orders linked to Shiprocket', 'number', 'indigo'),
    metric('Delivered', statusCount('deliver'), 'Shipping status contains delivered', 'number', 'emerald'),
    metric('In transit', statusCount('transit') + statusCount('picked'), 'Picked up or in transit', 'number', 'blue'),
    metric('Pending', statusCount('new') + statusCount('pending'), 'New or pending shipping status', 'number', 'amber'),
    metric('RTO', statusCount('rto'), 'Return-to-origin statuses', 'number', 'rose'),
    metric('With AWB', await Order.countDocuments({ ...shiprocketMatch, awbCode: { $exists: true, $nin: [null, ''] } }), 'Orders with tracking number', 'number', 'violet'),
  ], [
    trend('Shipment volume', trendRows.map(row => ({ _id: row._id, value: row.count, secondary: row.amount }))),
    bars('Shiprocket statuses', statuses.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Shipments'),
    bars('Courier allocation', couriers.map(row => ({ label: row._id, value: row.count })), 'Shipments'),
    bars('Local fulfilment status', localStatuses.map(row => ({ label: row._id, value: row.count })), 'Orders'),
    table('Recent shipments', [{ key: 'orderNumber', label: 'Order' }, { key: 'shiprocketStatus', label: 'Shiprocket' }, { key: 'courierName', label: 'Courier' }, { key: 'awbCode', label: 'AWB' }, { key: 'total', label: 'Amount', format: 'currency' }, { key: 'createdAt', label: 'Created', format: 'date' }], recent.map(row => ({ ...row, shiprocketStatus: label(row.shiprocketStatus), courierName: row.courierName || 'Unassigned', awbCode: row.awbCode || '—', total: number(row.total) }))),
  ], 'Shipping analytics use local Shiprocket fields and do not call the external carrier API when the panel opens.');
};

const getMarketingAnalytics = async window => {
  const [tracking, devices, codes, couponOrders, subscribers, subscriberSources] = await Promise.all([
    ReferralTracking.aggregate([{ $match: window.match }, { $group: { _id: '$type', count: { $sum: 1 }, revenue: { $sum: { $ifNull: ['$orderValue', 0] } } } }, { $sort: { count: -1 } }]),
    ReferralTracking.aggregate([{ $match: window.match }, { $group: { _id: '$device', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ReferralCode.find(withTenant(window.scope)).sort({ 'stats.revenue': -1 }).limit(ROW_LIMIT).select('code ownerName ownerType isActive stats createdAt').lean(),
    Order.countDocuments({ ...window.match, couponCode: { $exists: true, $nin: [null, ''] } }),
    NewsletterSubscriber.countDocuments(withTenant(window.scope, { status: 'active' })),
    NewsletterSubscriber.aggregate([{ $match: withTenant(window.scope, { createdAt: window.match.createdAt }) }, { $group: { _id: { $ifNull: ['$source', 'Direct'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  const clicks = tracking.find(row => row._id === 'click')?.count;
  const conversions = tracking.find(row => row._id === 'conversion')?.count;
  const revenue = tracking.find(row => row._id === 'conversion')?.revenue;
  return baseResponse('marketing', window, [
    metric('Referral clicks', clicks, 'Tracked referral visits', 'number', 'indigo'),
    metric('Referral conversions', conversions, 'Tracked conversions', 'number', 'emerald'),
    metric('Referral revenue', revenue, 'Attributed order value', 'currency', 'blue'),
    metric('Referral conversion rate', clicks ? (number(conversions) / number(clicks)) * 100 : 0, 'Conversions ÷ clicks', 'percent', 'violet'),
    metric('Coupon orders', couponOrders, 'Orders carrying a coupon code', 'number', 'amber'),
    metric('Active subscribers', subscribers, 'Current newsletter subscribers', 'number', 'rose'),
  ], [
    bars('Referral activity', tracking.map(row => ({ label: row._id, value: row.count, secondary: row.revenue })), 'Events'),
    bars('Referral devices', devices.map(row => ({ label: row._id, value: row.count })), 'Events'),
    bars('Subscriber sources', subscriberSources.map(row => ({ label: row._id, value: row.count })), 'Subscribers'),
    table('Top referral codes', [{ key: 'code', label: 'Code' }, { key: 'ownerName', label: 'Owner' }, { key: 'ownerType', label: 'Type' }, { key: 'clicks', label: 'Clicks' }, { key: 'conversions', label: 'Conversions' }, { key: 'revenue', label: 'Revenue', format: 'currency' }], codes.map(row => ({ code: row.code, ownerName: row.ownerName || '—', ownerType: label(row.ownerType), clicks: number(row.stats?.clicks), conversions: number(row.stats?.conversions), revenue: number(row.stats?.revenue) }))),
  ], 'Referral activity respects the selected date range; code totals are the denormalized lifetime totals maintained by the referral module.');
};

const getStorefrontAnalytics = async window => {
  const [total, types, devices, pages, searches, products, trendRows, sessions, users, recent] = await Promise.all([
    ClickEvent.countDocuments(window.match),
    ClickEvent.aggregate([{ $match: window.match }, { $group: { _id: '$eventType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ClickEvent.aggregate([{ $match: window.match }, { $group: { _id: '$device', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ClickEvent.aggregate([{ $match: window.match }, { $group: { _id: { $ifNull: ['$page', 'Unknown page'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: ROW_LIMIT }]),
    ClickEvent.aggregate([{ $match: { ...window.match, eventType: 'search', target: { $nin: [null, ''] } } }, { $group: { _id: '$target', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: ROW_LIMIT }]),
    ClickEvent.aggregate([{ $match: { ...window.match, eventType: 'product_click', target: { $nin: [null, ''] } } }, { $group: { _id: '$target', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: ROW_LIMIT }]),
    ClickEvent.aggregate([{ $match: window.match }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ClickEvent.aggregate([{ $match: { ...window.match, sessionId: { $nin: [null, ''] } } }, { $group: { _id: '$sessionId' } }, { $count: 'count' }]).allowDiskUse(true),
    ClickEvent.aggregate([{ $match: { ...window.match, userId: { $ne: null } } }, { $group: { _id: '$userId' } }, { $count: 'count' }]).allowDiskUse(true),
    ClickEvent.find(window.match).sort({ createdAt: -1 }).limit(ROW_LIMIT).select('eventType page target device referrer createdAt').lean(),
  ]);
  const eventCounts = Object.fromEntries(types.map(row => [row._id, number(row.count)]));
  const funnelKeys = [['page_view', 'Page views'], ['product_click', 'Product clicks'], ['add_to_cart', 'Add to cart'], ['checkout_start', 'Checkout starts'], ['order_placed', 'Orders placed']];
  const pageViews = eventCounts.page_view || 0;
  return baseResponse('storefront', window, [
    metric('Tracked events', total, 'All storefront telemetry', 'number', 'indigo'),
    metric('Unique sessions', sessions[0]?.count, 'Distinct session IDs', 'number', 'blue'),
    metric('Unique users', users[0]?.count, 'Known logged-in users', 'number', 'emerald'),
    metric('Page-to-order rate', pageViews ? (number(eventCounts.order_placed) / pageViews) * 100 : 0, 'Orders placed ÷ page views', 'percent', 'violet'),
    metric('Product clicks', eventCounts.product_click, 'Product discovery events', 'number', 'amber'),
    metric('Add-to-cart events', eventCounts.add_to_cart, 'Cart intent events', 'number', 'rose'),
  ], [
    bars('Event types', types.map(row => ({ label: row._id, value: row.count })), 'Events'),
    bars('Devices', devices.map(row => ({ label: row._id, value: row.count })), 'Events'),
    trend('Traffic trend', trendRows.map(row => ({ _id: row._id, value: row.count }))),
    bars('Conversion funnel', funnelKeys.map(([key, name]) => ({ label: name, value: eventCounts[key] || 0 })), 'Events'),
    table('Top pages', [{ key: 'page', label: 'Page' }, { key: 'count', label: 'Events' }], pages.map(row => ({ page: row._id, count: number(row.count) }))),
    table('Top searches', [{ key: 'search', label: 'Search' }, { key: 'count', label: 'Searches' }], searches.map(row => ({ search: row._id, count: number(row.count) }))),
    table('Top product clicks', [{ key: 'product', label: 'Product / target' }, { key: 'count', label: 'Clicks' }], products.map(row => ({ product: row._id, count: number(row.count) }))),
    table('Recent storefront events', [{ key: 'eventType', label: 'Event' }, { key: 'page', label: 'Page' }, { key: 'target', label: 'Target' }, { key: 'device', label: 'Device' }, { key: 'createdAt', label: 'Created', format: 'date' }], recent.map(row => ({ eventType: label(row.eventType), page: row.page || '—', target: row.target || '—', device: label(row.device), createdAt: row.createdAt }))),
  ], 'Storefront telemetry is intentionally retained for a bounded period by the ClickEvent TTL policy.');
};

const getVendorAnalytics = async window => {
  const [total, statuses, verification, created, payouts, payoutTrend, topVendors] = await Promise.all([
    Vendor.countDocuments(withTenant(window.scope)),
    Vendor.aggregate([{ $match: withTenant(window.scope) }, { $group: { _id: '$status', count: { $sum: 1 }, earnings: { $sum: '$totalEarnings' } } }, { $sort: { count: -1 } }]),
    Vendor.aggregate([{ $match: withTenant(window.scope) }, { $group: { _id: '$verification.status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Vendor.aggregate([{ $match: withTenant(window.scope, { createdAt: window.match.createdAt }) }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Payout.aggregate([{ $match: window.match }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' }, netAmount: { $sum: '$netAmount' } } }, { $sort: { amount: -1 } }]),
    Payout.aggregate([{ $match: window.match }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Vendor.find(withTenant(window.scope)).sort({ totalEarnings: -1 }).limit(ROW_LIMIT).select('storeName status verification.status stats totalEarnings pendingPayout totalWithdrawn commissionRate').lean(),
  ]);
  return baseResponse('vendors', window, [
    metric('Total vendors', total, 'Vendor accounts', 'number', 'indigo'),
    metric('Active vendors', statuses.find(row => row._id === 'active')?.count, 'Approved and active', 'number', 'emerald'),
    metric('Pending vendors', statuses.find(row => row._id === 'pending')?.count, 'Awaiting approval', 'number', 'amber'),
    metric('Verified vendors', verification.find(row => row._id === 'verified')?.count, 'Verification status verified', 'number', 'blue'),
    metric('Payout value', sum(payouts, 'amount'), 'Payout requests in selected period', 'currency', 'violet'),
    metric('Pending payout value', payouts.filter(row => ['pending', 'processing'].includes(row._id)).reduce((totalAmount, row) => totalAmount + number(row.amount), 0), 'Pending and processing', 'currency', 'rose'),
  ], [
    trend('Vendor registrations', dateTrend(created, 'count', null)),
    bars('Vendor status', statuses.map(row => ({ label: row._id, value: row.count, secondary: row.earnings })), 'Vendors'),
    bars('Verification status', verification.map(row => ({ label: row._id, value: row.count })), 'Vendors'),
    bars('Payout status', payouts.map(row => ({ label: row._id, value: row.count, secondary: row.amount })), 'Payouts'),
    trend('Payout trend', payoutTrend.map(row => ({ _id: row._id, value: row.amount, secondary: row.count })), 'currency'),
    table('Top vendors by lifetime earnings', [{ key: 'storeName', label: 'Store' }, { key: 'status', label: 'Status' }, { key: 'totalEarnings', label: 'Earnings', format: 'currency' }, { key: 'pendingPayout', label: 'Pending', format: 'currency' }, { key: 'commissionRate', label: 'Commission', format: 'percent' }], topVendors.map(row => ({ storeName: row.storeName, status: label(row.status), totalEarnings: number(row.totalEarnings), pendingPayout: number(row.pendingPayout), commissionRate: number(row.commissionRate) }))),
  ], 'Vendor earnings are lifetime denormalized values; payout totals use requests created in the selected period.');
};

const getSupportAIAnalytics = async window => {
  const [conversationStats, conversationCategories, aiStatus, aiFeatures, aiTrend, notifications, recentFailures] = await Promise.all([
    Conversation.aggregate([{ $match: window.match }, { $group: { _id: null, total: { $sum: 1 }, credits: { $sum: '$creditsCost' }, escalated: { $sum: { $cond: [{ $eq: ['$status', 'escalated'] }, 1, 0] } }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } } } }]),
    Conversation.aggregate([{ $match: window.match }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    AIUsage.aggregate([{ $match: window.match }, { $group: { _id: '$status', count: { $sum: 1 }, credits: { $sum: '$netCredits' } } }, { $sort: { count: -1 } }]),
    AIUsage.aggregate([{ $match: window.match }, { $group: { _id: '$feature', count: { $sum: 1 }, credits: { $sum: '$netCredits' }, duration: { $avg: '$durationMs' } } }, { $sort: { credits: -1 } }, { $limit: ROW_LIMIT }]),
    AIUsage.aggregate([{ $match: window.match }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, count: { $sum: 1 }, credits: { $sum: '$netCredits' } } }, { $sort: { _id: 1 } }]),
    Notification.aggregate([{ $match: window.match }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    AIUsage.find({ ...window.match, status: { $in: ['failed', 'rejected'] } }).sort({ createdAt: -1 }).limit(ROW_LIMIT).select('feature action provider status error credits netCredits createdAt userSnapshot').lean(),
  ]);
  const c = conversationStats[0] || {};
  return baseResponse('support-ai', window, [
    metric('Conversations', c.total, 'AI support conversations', 'number', 'indigo'),
    metric('Escalated conversations', c.escalated, c.total ? `${((number(c.escalated) / number(c.total)) * 100).toFixed(1)}% escalation rate` : '0% escalation rate', 'number', 'rose'),
    metric('Resolved conversations', c.resolved, 'Marked resolved', 'number', 'emerald'),
    metric('AI requests', sum(aiStatus, 'count'), 'Tracked AI usage records', 'number', 'blue'),
    metric('Net AI credits', sum(aiStatus, 'credits'), 'Usage after refunds', 'number', 'amber'),
    metric('Failed AI requests', aiStatus.filter(row => ['failed', 'rejected'].includes(row._id)).reduce((totalCount, row) => totalCount + number(row.count), 0), 'Failed or rejected requests', 'number', 'violet'),
  ], [
    bars('Conversation categories', conversationCategories.map(row => ({ label: row._id, value: row.count })), 'Conversations'),
    bars('AI request status', aiStatus.map(row => ({ label: row._id, value: row.count, secondary: row.credits })), 'Requests'),
    trend('AI usage trend', aiTrend.map(row => ({ _id: row._id, value: row.count, secondary: row.credits }))),
    bars('AI usage by feature', aiFeatures.map(row => ({ label: row._id, value: row.count, secondary: row.credits })), 'Requests'),
    bars('Notification status', notifications.map(row => ({ label: row._id, value: row.count })), 'Notifications'),
    table('Recent AI failures', [{ key: 'feature', label: 'Feature' }, { key: 'action', label: 'Action' }, { key: 'status', label: 'Status' }, { key: 'error', label: 'Error' }, { key: 'createdAt', label: 'Created', format: 'date' }], recentFailures.map(row => ({ feature: row.feature, action: row.action, status: label(row.status), error: row.error || '—', createdAt: row.createdAt }))),
  ], 'AI analytics excludes prompt content and secrets; only operational usage metadata is shown.');
};

const getContentAnalytics = async window => {
  const [pages, pageStatuses, pageTrend, blogs, blogStatuses, blogViews, categories, brands, reviews] = await Promise.all([
    Page.countDocuments(withTenant(window.scope)),
    Page.aggregate([{ $match: withTenant(window.scope) }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Page.aggregate([{ $match: window.match }, { $group: { _id: { $dateToString: { format: dateFormat(window.days), date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Blog.countDocuments(withTenant(window.scope)),
    Blog.aggregate([{ $match: withTenant(window.scope) }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Blog.aggregate([{ $match: withTenant(window.scope, { status: 'published' }) }, { $group: { _id: null, views: { $sum: '$viewCount' } } }]),
    Category.countDocuments(withTenant(window.scope)),
    Brand.countDocuments(withTenant(window.scope)),
    Review.aggregate([{ $match: window.match }, { $group: { _id: '$status', count: { $sum: 1 }, rating: { $avg: '$rating' } } }, { $sort: { count: -1 } }]),
  ]);
  return baseResponse('content', window, [
    metric('Pages', pages, 'Page Builder records', 'number', 'indigo'),
    metric('Published pages', pageStatuses.find(row => row._id === 'published')?.count, 'Live platform pages', 'number', 'emerald'),
    metric('Blogs', blogs, 'Blog records', 'number', 'blue'),
    metric('Published blog views', blogViews[0]?.views, 'Lifetime views on published posts', 'number', 'violet'),
    metric('Categories', categories, 'Product categories', 'number', 'amber'),
    metric('Brands', brands, 'Product brands', 'number', 'rose'),
  ], [
    trend('Pages created', dateTrend(pageTrend, 'count', null)),
    bars('Page status', pageStatuses.map(row => ({ label: row._id, value: row.count })), 'Pages'),
    bars('Blog status', blogStatuses.map(row => ({ label: row._id, value: row.count })), 'Posts'),
    bars('Review status', reviews.map(row => ({ label: row._id, value: row.count, secondary: row.rating })), 'Reviews'),
  ], 'Content analytics covers Page Builder, blog, taxonomy and review operations.');
};

const getIntegrationAnalytics = async window => {
  const [integrations, connections, jobs, listings, marketplaceOrders] = await Promise.all([
    (window.scope.tenantId
      ? IntegrationConnection.find(withTenant(window.scope)).select('provider enabled status lastTest updatedAt').lean()
      : Integration.find().select('provider enabled status lastTestAt updatedAt').lean()
    ).then(rows => rows.map(row => ({ ...row, lastTestAt: row.lastTestAt || row.lastTest?.testedAt || null }))),
    MarketplaceConnection.find(withTenant(window.scope)).select('provider name enabled status lastTestAt lastSyncAt createdAt').lean(),
    MarketplaceJob.aggregate([{ $match: window.match }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    MarketplaceListing.countDocuments(withTenant(window.scope)),
    MarketplaceOrder.countDocuments(window.match),
  ]);
  return baseResponse('integrations', window, [
    metric('Core integrations', integrations.length, 'Configured provider records', 'number', 'indigo'),
    metric('Enabled integrations', integrations.filter(row => row.enabled).length, 'Core providers enabled', 'number', 'emerald'),
    metric('Marketplace connections', connections.length, 'Amazon and Flipkart connections', 'number', 'blue'),
    metric('Connected marketplaces', connections.filter(row => row.status === 'connected').length, 'Healthy marketplace connections', 'number', 'violet'),
    metric('Marketplace listings', listings, 'Synced listing records', 'number', 'amber'),
    metric('Marketplace orders', marketplaceOrders, 'Orders imported in selected period', 'number', 'rose'),
  ], [
    bars('Core integration status', integrations.map(row => ({ label: row.provider, value: row.enabled ? 1 : 0, secondary: row.status })), 'Enabled'),
    bars('Marketplace connection status', connections.map(row => ({ label: `${row.provider} · ${row.name}`, value: row.status === 'connected' ? 1 : 0, secondary: row.status })), 'Connected'),
    bars('Marketplace job status', jobs.map(row => ({ label: row._id, value: row.count })), 'Jobs'),
    table('Marketplace connections', [{ key: 'provider', label: 'Provider' }, { key: 'name', label: 'Connection' }, { key: 'status', label: 'Status' }, { key: 'lastSyncAt', label: 'Last sync', format: 'date' }, { key: 'lastTestAt', label: 'Last test', format: 'date' }], connections.map(row => ({ provider: label(row.provider), name: row.name, status: label(row.status), lastSyncAt: row.lastSyncAt, lastTestAt: row.lastTestAt }))),
  ], 'Credential values are never returned. This panel only exposes provider health and operational counters.');
};

const OPERATION_HANDLERS = {
  sales: getSalesAnalytics,
  profit: getProfitAnalytics,
  customers: getCustomerAnalytics,
  catalog: getCatalogAnalytics,
  inventory: getInventoryAnalytics,
  payments: getPaymentAnalytics,
  refunds: getRefundAnalytics,
  shipping: getShippingAnalytics,
  marketing: getMarketingAnalytics,
  storefront: getStorefrontAnalytics,
  vendors: getVendorAnalytics,
  'support-ai': getSupportAIAnalytics,
  content: getContentAnalytics,
  integrations: getIntegrationAnalytics,
};

// @desc    Get one detailed analytics module on demand
// @route   GET /api/admin/analytics/operations/:operation
const getOperationAnalytics = asyncHandler(async (req, res) => {
  const operation = String(req.params.operation || '').toLowerCase();
  const handler = OPERATION_HANDLERS[operation];
  if (!handler) {
    res.status(404);
    throw new Error('Unknown analytics operation');
  }
  const scope = await buildTenantAnalyticsScope(req.tenant);
  const data = await handler(getWindow(req.query || {}, scope));
  res.json(data);
});

module.exports = { getOperationAnalytics, OPERATION_HANDLERS };
