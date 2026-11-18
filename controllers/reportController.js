const asyncHandler = require('express-async-handler');
const ExcelJS = require('exceljs');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const Bundle = require('../models/Bundle');
const InventoryMovement = require('../models/InventoryMovement');
const ReturnRequest = require('../models/ReturnRequest');
const RefundRequest = require('../models/RefundRequest');
const Shipment = require('../models/Shipment');
const PaymentTransaction = require('../models/PaymentTransaction');
const { buildTenantAnalyticsScope, withTenant, withTenantUsers } = require('../services/tenantAnalyticsScope');
const { PLATFORM_NAME } = require('../constants/branding');

const REPORT_TYPES = ['orders', 'products', 'customers', 'sales_summary', 'categories', 'brands', 'reviews', 'coupons', 'bundles', 'inventory', 'returns', 'refunds', 'shipments', 'payments', 'profit'];
const DATE_REPORT_TYPES = ['orders', 'products', 'customers', 'sales_summary', 'reviews', 'inventory', 'returns', 'refunds', 'shipments', 'payments', 'profit'];
const REPORT_DESCRIPTIONS = {
  orders: 'Every order with customer, payment, fulfilment and totals.',
  products: 'Catalog, stock, pricing, visibility and sales fields.',
  customers: 'Customer contacts, account status and registration date.',
  sales_summary: 'Paid revenue, average order value and status/payment breakdown.',
  categories: 'Category hierarchy, visibility and sort order.',
  brands: 'Brand catalog, visibility and ordering information.',
  reviews: 'Product ratings, moderation status and review details.',
  coupons: 'Discount rules, limits, usage and expiry information.',
  bundles: 'Fixed, custom and mix-and-match bundle catalog with component definitions.',
  inventory: 'Inventory movements, reservations, sales and restocks.',
  returns: 'Return and replacement requests with lifecycle status and amounts.',
  refunds: 'Refund requests, approval state and processed amounts.',
  shipments: 'Shipment provider, tracking, fulfilment and delivery state.',
  payments: 'Append-only payment transaction ledger for reconciliation.',
  profit: 'Order-level revenue, captured cost and margin snapshot.',
};
const MAX_EXPORT_ROWS = Number(process.env.REPORT_MAX_ROWS) || 50000;

function applyDateFilter(query, startDate, endDate) {
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) {
      const end = new Date(`${endDate}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      query.createdAt.$lt = end;
    }
  }
  return query;
}

function isoDate(value) {
  return value ? new Date(value).toISOString() : '';
}

function reportDateFilter(startDate, endDate) {
  const match = {};
  return applyDateFilter(match, startDate, endDate);
}

async function addSheetFromRows(workbook, sheetName, headers, rows) {
  const sheet = workbook.addWorksheet(sheetName, { headerRows: 1 });
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((col, i) => { col.width = Math.min(40, Math.max(12, headers[i]?.length || 10)); });
}

// @desc    Generate Excel report by type
// @route   GET /api/admin/reports/excel?type=orders&startDate=...&endDate=...
const generateReport = asyncHandler(async (req, res) => {
  const { type, startDate, endDate } = req.query;
  if (!type || !REPORT_TYPES.includes(type)) {
    res.status(400);
    throw new Error(`Invalid report type. Use one of: ${REPORT_TYPES.join(', ')}`);
  }

  const scope = await buildTenantAnalyticsScope(req.tenant);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${PLATFORM_NAME} Admin`;
  workbook.created = new Date();

  if (type === 'orders') {
    const match = {};
    applyDateFilter(match, startDate, endDate);
    const orders = await Order.find(withTenant(scope, match))
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(MAX_EXPORT_ROWS)
      .lean();
    const headers = ['Order #', 'Date', 'Customer', 'Email', 'Payment', 'Payment Status', 'Order Status', 'Subtotal', 'Shipping', 'Tax', 'Discount', 'Total', 'Items'];
    const rows = orders.map((o) => [
      o.orderNumber || '',
      o.createdAt ? new Date(o.createdAt).toISOString() : '',
      o.user?.name || o.shippingAddress?.fullName || '',
      o.user?.email || '',
      o.paymentMethod || '',
      o.paymentStatus || '',
      o.orderStatus || '',
      o.subtotal ?? '',
      o.shippingCost ?? '',
      o.tax ?? '',
      o.discount ?? '',
      o.total ?? '',
      (o.items && o.items.length) ? o.items.reduce((s, i) => s + (i.quantity || 0), 0) : 0,
    ]);
    await addSheetFromRows(workbook, 'Orders', headers, rows);
  }

  if (type === 'products') {
    const match = {};
    applyDateFilter(match, startDate, endDate);
    const products = await Product.find(withTenant(scope, match))
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .limit(MAX_EXPORT_ROWS)
      .lean();
    const headers = ['Title', 'SKU', 'Category', 'Brand', 'Price', 'Compare Price', 'Discount %', 'Stock', 'Low Stock', 'Featured', 'Active', 'Total Sales', 'Created'];
    const rows = products.map((p) => [
      p.title || '',
      p.sku || '',
      p.category?.name || '',
      p.brand || '',
      p.price ?? '',
      p.comparePrice ?? '',
      p.discount ?? '',
      p.stock ?? '',
      p.lowStockThreshold ?? '',
      p.isFeatured ? 'Yes' : 'No',
      p.isActive ? 'Yes' : 'No',
      p.totalSales ?? 0,
      p.createdAt ? new Date(p.createdAt).toISOString() : '',
    ]);
    await addSheetFromRows(workbook, 'Products', headers, rows);
  }

  if (type === 'customers') {
    const match = { role: 'customer' };
    applyDateFilter(match, startDate, endDate);
    const users = await User.find(withTenantUsers(scope, match)).select('name email phone role isActive createdAt').sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Name', 'Email', 'Phone', 'Active', 'Created'];
    const rows = users.map((u) => [
      u.name || '',
      u.email || '',
      u.phone || '',
      u.isActive ? 'Yes' : 'No',
      u.createdAt ? new Date(u.createdAt).toISOString() : '',
    ]);
    await addSheetFromRows(workbook, 'Customers', headers, rows);
  }

  if (type === 'sales_summary') {
    const match = { paymentStatus: 'paid' };
    applyDateFilter(match, startDate, endDate);
    const orders = await Order.find(withTenant(scope, match)).limit(MAX_EXPORT_ROWS).lean();
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const byStatus = {};
    const byPayment = {};
    orders.forEach((o) => {
      byStatus[o.orderStatus] = (byStatus[o.orderStatus] || 0) + 1;
      byPayment[o.paymentMethod] = (byPayment[o.paymentMethod] || 0) + 1;
    });
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Total Orders', orders.length],
      ['Total Revenue (₹)', totalRevenue.toFixed(2)],
      ['Avg Order Value (₹)', orders.length ? (totalRevenue / orders.length).toFixed(2) : 0],
      ['', ''],
      ['By Order Status', ''],
      ...Object.entries(byStatus).map(([k, v]) => [k, v]),
      ['', ''],
      ['By Payment Method', ''],
      ...Object.entries(byPayment).map(([k, v]) => [k, v]),
    ];
    await addSheetFromRows(workbook, 'Sales Summary', headers, rows);
  }

  if (type === 'categories') {
    const categories = await Category.find(withTenant(scope)).sort({ order: 1, name: 1 }).limit(MAX_EXPORT_ROWS).populate('parent', 'name').lean();
    const headers = ['Name', 'Slug', 'Parent', 'Description', 'Active', 'Order', 'Created'];
    const rows = categories.map((c) => [
      c.name || '',
      c.slug || '',
      c.parent?.name || '',
      (c.description || '').substring(0, 100),
      c.isActive ? 'Yes' : 'No',
      c.order ?? '',
      c.createdAt ? new Date(c.createdAt).toISOString() : '',
    ]);
    await addSheetFromRows(workbook, 'Categories', headers, rows);
  }

  if (type === 'brands') {
    const brands = await Brand.find(withTenant(scope)).sort({ order: 1, name: 1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Name', 'Slug', 'Description', 'Active', 'Order', 'Created'];
    const rows = brands.map((b) => [
      b.name || '',
      b.slug || '',
      (b.description || '').substring(0, 100),
      b.isActive ? 'Yes' : 'No',
      b.order ?? '',
      b.createdAt ? new Date(b.createdAt).toISOString() : '',
    ]);
    await addSheetFromRows(workbook, 'Brands', headers, rows);
  }

  if (type === 'reviews') {
    const match = {};
    applyDateFilter(match, startDate, endDate);
    const reviews = await Review.find(withTenant(scope, match))
      .populate('product', 'title slug')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(MAX_EXPORT_ROWS)
      .lean();
    const headers = ['Product', 'User', 'Rating', 'Title', 'Comment', 'Status', 'Verified', 'Created'];
    const rows = reviews.map((r) => [
      r.product?.title || '',
      r.user?.email || '',
      r.rating ?? '',
      (r.title || '').substring(0, 50),
      (r.comment || '').substring(0, 100),
      r.status || '',
      r.isVerifiedPurchase ? 'Yes' : 'No',
      r.createdAt ? new Date(r.createdAt).toISOString() : '',
    ]);
    await addSheetFromRows(workbook, 'Reviews', headers, rows);
  }

  if (type === 'coupons') {
    const coupons = await Coupon.find(withTenant(scope)).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Code', 'Type', 'Value', 'Min Order', 'Max Discount', 'Usage Limit', 'Usage Count', 'Active', 'Expires', 'Created'];
    const rows = coupons.map((c) => [
      c.code || '',
      c.type || '',
      c.value ?? '',
      c.minOrderAmount ?? '',
      c.maxDiscount ?? '',
      c.usageLimit ?? 'Unlimited',
      c.usageCount ?? 0,
      c.isActive ? 'Yes' : 'No',
      c.expiresAt ? new Date(c.expiresAt).toISOString() : '',
      c.createdAt ? new Date(c.createdAt).toISOString() : '',
    ]);
    await addSheetFromRows(workbook, 'Coupons', headers, rows);
  }

  if (type === 'bundles') {
    const bundles = await Bundle.find(withTenant(scope)).populate('category', 'name').sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Name', 'SKU', 'Type', 'Price', 'Compare Price', 'Components', 'Lifecycle', 'Active', 'Category', 'Created'];
    const rows = bundles.map(bundle => [bundle.name || '', bundle.sku || '', bundle.bundleType || '', bundle.price ?? 0, bundle.comparePrice ?? 0, (bundle.components || []).length, bundle.lifecycleStatus || '', bundle.isActive ? 'Yes' : 'No', bundle.category?.name || '', isoDate(bundle.createdAt)]);
    await addSheetFromRows(workbook, 'Bundles', headers, rows);
  }

  if (type === 'inventory') {
    const match = reportDateFilter(startDate, endDate);
    const movements = await InventoryMovement.find(withTenant(scope, match)).populate('product', 'title sku').populate('order', 'orderNumber').sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Date', 'Product', 'SKU', 'Order', 'Type', 'Quantity', 'Variant', 'Reason', 'Available After', 'Reserved After', 'Sold After'];
    const rows = movements.map(item => [isoDate(item.createdAt), item.product?.title || '', item.product?.sku || '', item.order?.orderNumber || '', item.type || '', item.quantity ?? 0, item.variantKey || '', item.reason || '', item.availableAfter ?? 0, item.reservedAfter ?? 0, item.soldAfter ?? 0]);
    await addSheetFromRows(workbook, 'Inventory', headers, rows);
  }

  if (type === 'returns') {
    const match = reportDateFilter(startDate, endDate);
    const returns = await ReturnRequest.find(withTenant(scope, match)).populate('order', 'orderNumber').populate('user', 'name email').sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Request', 'Date', 'Order', 'Customer', 'Type', 'Status', 'Reason', 'Requested Amount', 'Approved Amount', 'Items'];
    const rows = returns.map(item => [item.requestNumber || '', isoDate(item.createdAt), item.order?.orderNumber || '', item.user?.name || item.user?.email || '', item.type || '', item.status || '', item.reason || '', item.requestedAmount ?? 0, item.approvedAmount ?? '', (item.items || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0)]);
    await addSheetFromRows(workbook, 'Returns', headers, rows);
  }

  if (type === 'refunds') {
    const match = reportDateFilter(startDate, endDate);
    const refunds = await RefundRequest.find(withTenant(scope, match)).populate('order', 'orderNumber').populate('user', 'name email').sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Date', 'Order', 'Customer', 'Type', 'Status', 'Reason', 'Requested Amount', 'Approved Amount', 'Processed'];
    const rows = refunds.map(item => [isoDate(item.createdAt), item.order?.orderNumber || '', item.user?.name || item.user?.email || '', item.type || '', item.status || '', item.reason || '', item.amount ?? 0, item.approvedAmount ?? '', isoDate(item.processedAt)]);
    await addSheetFromRows(workbook, 'Refunds', headers, rows);
  }

  if (type === 'shipments') {
    const match = reportDateFilter(startDate, endDate);
    const shipments = await Shipment.find(withTenant(scope, match)).populate('order', 'orderNumber total paymentMethod').sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Date', 'Order', 'Provider', 'Status', 'Tracking', 'Courier', 'External Order', 'Last Event'];
    const rows = shipments.map(item => [isoDate(item.createdAt), item.order?.orderNumber || '', item.provider || '', item.status || '', item.trackingNumber || '', item.courierName || '', item.externalOrderId || '', isoDate(item.lastEventAt)]);
    await addSheetFromRows(workbook, 'Shipments', headers, rows);
  }

  if (type === 'payments') {
    const match = reportDateFilter(startDate, endDate);
    const payments = await PaymentTransaction.find(withTenant(scope, match)).populate('order', 'orderNumber total').sort({ occurredAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Occurred', 'Order', 'Provider', 'Event', 'Status', 'Amount', 'Currency', 'External Payment', 'Source', 'Reason'];
    const rows = payments.map(item => [isoDate(item.occurredAt), item.order?.orderNumber || '', item.provider || '', item.eventType || '', item.status || '', item.amount ?? 0, item.currency || '', item.externalPaymentId || '', item.source || '', item.reason || '']);
    await addSheetFromRows(workbook, 'Payments', headers, rows);
  }

  if (type === 'profit') {
    const match = { paymentStatus: { $in: ['paid', 'partially_refunded'] } };
    applyDateFilter(match, startDate, endDate);
    const orders = await Order.find(withTenant(scope, match)).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = ['Date', 'Order', 'Revenue', 'Captured Cost', 'Shipping', 'Tax', 'Discount', 'Gross Margin', 'Margin %'];
    const rows = orders.map(order => {
      const cost = (order.items || []).reduce((sum, item) => sum + Number(item.costPriceCaptured ? item.costPrice || 0 : 0) * Number(item.quantity || 0), 0);
      const margin = Number(order.total || 0) - cost;
      return [isoDate(order.createdAt), order.orderNumber || '', order.total ?? 0, cost, order.shippingCost ?? 0, order.tax ?? 0, order.discount ?? 0, margin, order.total ? (margin / order.total) * 100 : 0];
    });
    await addSheetFromRows(workbook, 'Profit', headers, rows);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `report-${type}-${Date.now()}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// @desc    Get list of available report types (for UI)
// @route   GET /api/admin/reports/types
const getReportTypes = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    types: REPORT_TYPES.map((t) => ({
      id: t,
      name: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: REPORT_DESCRIPTIONS[t],
      supportsDateRange: DATE_REPORT_TYPES.includes(t),
    })),
  });
});

// @desc    Preview a report before downloading the full Excel file
// @route   GET /api/admin/reports/preview?type=orders&startDate=...&endDate=...
const previewReport = asyncHandler(async (req, res) => {
  const { type, startDate, endDate } = req.query;
  if (!type || !REPORT_TYPES.includes(type)) {
    res.status(400);
    throw new Error(`Invalid report type. Use one of: ${REPORT_TYPES.join(', ')}`);
  }

  const scope = await buildTenantAnalyticsScope(req.tenant);

  const limit = 20;
  let columns = [];
  let rows = [];
  let count = 0;
  let summary = {};

  if (type === 'orders') {
    const match = reportDateFilter(startDate, endDate);
    const [orders, total] = await Promise.all([
      Order.find(withTenant(scope, match)).populate('user', 'name email').sort({ createdAt: -1 }).limit(limit).lean(),
      Order.countDocuments(withTenant(scope, match)),
    ]);
    columns = ['Order #', 'Date', 'Customer', 'Payment', 'Payment Status', 'Order Status', 'Total'];
    rows = orders.map((order) => [order.orderNumber || '', isoDate(order.createdAt), order.user?.name || order.shippingAddress?.fullName || 'Guest', order.paymentMethod || '', order.paymentStatus || '', order.orderStatus || '', order.total ?? 0]);
    count = total;
  }

  if (type === 'bundles') {
    const [bundles, total] = await Promise.all([
      Bundle.find(withTenant(scope)).sort({ createdAt: -1 }).limit(limit).lean(),
      Bundle.countDocuments(withTenant(scope)),
    ]);
    columns = ['Name', 'SKU', 'Type', 'Price', 'Components', 'Lifecycle', 'Active', 'Created'];
    rows = bundles.map(bundle => [bundle.name || '', bundle.sku || '', bundle.bundleType || '', bundle.price ?? 0, (bundle.components || []).length, bundle.lifecycleStatus || '', bundle.isActive ? 'Yes' : 'No', isoDate(bundle.createdAt)]);
    count = total;
  }

  if (type === 'inventory') {
    const match = reportDateFilter(startDate, endDate);
    const [movements, total] = await Promise.all([
      InventoryMovement.find(withTenant(scope, match)).populate('product', 'title sku').populate('order', 'orderNumber').sort({ createdAt: -1 }).limit(limit).lean(),
      InventoryMovement.countDocuments(withTenant(scope, match)),
    ]);
    columns = ['Date', 'Product', 'Order', 'Type', 'Quantity', 'Available', 'Reserved', 'Sold'];
    rows = movements.map(item => [isoDate(item.createdAt), item.product?.title || '', item.order?.orderNumber || '', item.type || '', item.quantity ?? 0, item.availableAfter ?? 0, item.reservedAfter ?? 0, item.soldAfter ?? 0]);
    count = total;
  }

  if (type === 'returns') {
    const match = reportDateFilter(startDate, endDate);
    const [returns, total] = await Promise.all([
      ReturnRequest.find(withTenant(scope, match)).populate('order', 'orderNumber').sort({ createdAt: -1 }).limit(limit).lean(),
      ReturnRequest.countDocuments(withTenant(scope, match)),
    ]);
    columns = ['Request', 'Order', 'Type', 'Status', 'Reason', 'Requested Amount', 'Approved Amount', 'Created'];
    rows = returns.map(item => [item.requestNumber || '', item.order?.orderNumber || '', item.type || '', item.status || '', item.reason || '', item.requestedAmount ?? 0, item.approvedAmount ?? '', isoDate(item.createdAt)]);
    count = total;
  }

  if (type === 'refunds') {
    const match = reportDateFilter(startDate, endDate);
    const [refunds, total] = await Promise.all([
      RefundRequest.find(withTenant(scope, match)).populate('order', 'orderNumber').sort({ createdAt: -1 }).limit(limit).lean(),
      RefundRequest.countDocuments(withTenant(scope, match)),
    ]);
    columns = ['Date', 'Order', 'Type', 'Status', 'Reason', 'Requested Amount', 'Approved Amount', 'Processed'];
    rows = refunds.map(item => [isoDate(item.createdAt), item.order?.orderNumber || '', item.type || '', item.status || '', item.reason || '', item.amount ?? 0, item.approvedAmount ?? '', isoDate(item.processedAt)]);
    count = total;
  }

  if (type === 'shipments') {
    const match = reportDateFilter(startDate, endDate);
    const [shipments, total] = await Promise.all([
      Shipment.find(withTenant(scope, match)).populate('order', 'orderNumber').sort({ createdAt: -1 }).limit(limit).lean(),
      Shipment.countDocuments(withTenant(scope, match)),
    ]);
    columns = ['Date', 'Order', 'Provider', 'Status', 'Tracking', 'Courier'];
    rows = shipments.map(item => [isoDate(item.createdAt), item.order?.orderNumber || '', item.provider || '', item.status || '', item.trackingNumber || '', item.courierName || '']);
    count = total;
  }

  if (type === 'payments') {
    const match = reportDateFilter(startDate, endDate);
    const [payments, total] = await Promise.all([
      PaymentTransaction.find(withTenant(scope, match)).populate('order', 'orderNumber').sort({ occurredAt: -1 }).limit(limit).lean(),
      PaymentTransaction.countDocuments(withTenant(scope, match)),
    ]);
    columns = ['Occurred', 'Order', 'Provider', 'Event', 'Status', 'Amount', 'Source'];
    rows = payments.map(item => [isoDate(item.occurredAt), item.order?.orderNumber || '', item.provider || '', item.eventType || '', item.status || '', item.amount ?? 0, item.source || '']);
    count = total;
  }

  if (type === 'profit') {
    const match = { paymentStatus: { $in: ['paid', 'partially_refunded'] }, ...reportDateFilter(startDate, endDate) };
    const orders = await Order.find(withTenant(scope, match)).select('orderNumber total items createdAt').sort({ createdAt: -1 }).limit(limit).lean();
    const totalCount = await Order.countDocuments(withTenant(scope, match));
    columns = ['Date', 'Order', 'Revenue', 'Captured Cost', 'Gross Margin', 'Margin %'];
    rows = orders.map(order => {
      const cost = (order.items || []).reduce((sum, item) => sum + Number(item.costPriceCaptured ? item.costPrice || 0 : 0) * Number(item.quantity || 0), 0);
      const margin = Number(order.total || 0) - cost;
      return [isoDate(order.createdAt), order.orderNumber || '', order.total ?? 0, cost, margin, order.total ? (margin / order.total) * 100 : 0];
    });
    count = totalCount;
  }

  if (type === 'products') {
    const match = reportDateFilter(startDate, endDate);
    const [products, total] = await Promise.all([
      Product.find(withTenant(scope, match)).populate('category', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Product.countDocuments(withTenant(scope, match)),
    ]);
    columns = ['Title', 'SKU', 'Category', 'Price', 'Stock', 'Active', 'Featured', 'Total Sales', 'Created'];
    rows = products.map((product) => [product.title || '', product.sku || '', product.category?.name || '', product.price ?? 0, product.stock ?? 0, product.isActive ? 'Yes' : 'No', product.isFeatured ? 'Yes' : 'No', product.totalSales ?? 0, isoDate(product.createdAt)]);
    count = total;
  }

  if (type === 'customers') {
    const match = reportDateFilter(startDate, endDate);
    match.role = 'customer';
    const [users, total] = await Promise.all([
      User.find(withTenantUsers(scope, match)).select('name email phone isActive createdAt').sort({ createdAt: -1 }).limit(limit).lean(),
      User.countDocuments(withTenantUsers(scope, match)),
    ]);
    columns = ['Name', 'Email', 'Phone', 'Active', 'Created'];
    rows = users.map((user) => [user.name || '', user.email || '', user.phone || '', user.isActive ? 'Yes' : 'No', isoDate(user.createdAt)]);
    count = total;
  }

  if (type === 'sales_summary') {
    const match = { paymentStatus: 'paid', ...reportDateFilter(startDate, endDate) };
    const orders = await Order.find(withTenant(scope, match)).select('total orderStatus paymentMethod').lean();
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const byStatus = {};
    const byPayment = {};
    orders.forEach((order) => {
      byStatus[order.orderStatus || 'unknown'] = (byStatus[order.orderStatus || 'unknown'] || 0) + 1;
      byPayment[order.paymentMethod || 'unknown'] = (byPayment[order.paymentMethod || 'unknown'] || 0) + 1;
    });
    columns = ['Metric', 'Value'];
    rows = [
      ['Total paid orders', orders.length],
      ['Total revenue', Number(totalRevenue.toFixed(2))],
      ['Average order value', Number((orders.length ? totalRevenue / orders.length : 0).toFixed(2))],
      ['Status breakdown', ''],
      ...Object.entries(byStatus).map(([key, value]) => [key, value]),
      ['Payment breakdown', ''],
      ...Object.entries(byPayment).map(([key, value]) => [key, value]),
    ];
    count = orders.length;
    summary = { totalRevenue, totalOrders: orders.length, avgOrderValue: orders.length ? totalRevenue / orders.length : 0, byStatus, byPayment };
  }

  if (type === 'categories') {
    const [categories, total] = await Promise.all([
      Category.find(withTenant(scope)).sort({ order: 1, name: 1 }).populate('parent', 'name').limit(limit).lean(),
      Category.countDocuments(withTenant(scope)),
    ]);
    columns = ['Name', 'Slug', 'Parent', 'Active', 'Order', 'Created'];
    rows = categories.map((category) => [category.name || '', category.slug || '', category.parent?.name || '', category.isActive ? 'Yes' : 'No', category.order ?? '', isoDate(category.createdAt)]);
    count = total;
  }

  if (type === 'brands') {
    const [brands, total] = await Promise.all([
      Brand.find(withTenant(scope)).sort({ order: 1, name: 1 }).limit(limit).lean(),
      Brand.countDocuments(withTenant(scope)),
    ]);
    columns = ['Name', 'Slug', 'Active', 'Order', 'Created'];
    rows = brands.map((brand) => [brand.name || '', brand.slug || '', brand.isActive ? 'Yes' : 'No', brand.order ?? '', isoDate(brand.createdAt)]);
    count = total;
  }

  if (type === 'reviews') {
    const match = reportDateFilter(startDate, endDate);
    const [reviews, total] = await Promise.all([
      Review.find(withTenant(scope, match)).populate('product', 'title').populate('user', 'email').sort({ createdAt: -1 }).limit(limit).lean(),
      Review.countDocuments(withTenant(scope, match)),
    ]);
    columns = ['Product', 'User', 'Rating', 'Status', 'Verified', 'Comment', 'Created'];
    rows = reviews.map((review) => [review.product?.title || '', review.user?.email || '', review.rating ?? '', review.status || '', review.isVerifiedPurchase ? 'Yes' : 'No', (review.comment || '').substring(0, 100), isoDate(review.createdAt)]);
    count = total;
  }

  if (type === 'coupons') {
    const [coupons, total] = await Promise.all([
      Coupon.find(withTenant(scope)).sort({ createdAt: -1 }).limit(limit).lean(),
      Coupon.countDocuments(withTenant(scope)),
    ]);
    columns = ['Code', 'Type', 'Value', 'Usage Count', 'Usage Limit', 'Active', 'Expires', 'Created'];
    rows = coupons.map((coupon) => [coupon.code || '', coupon.type || '', coupon.value ?? '', coupon.usageCount ?? 0, coupon.usageLimit ?? 'Unlimited', coupon.isActive ? 'Yes' : 'No', isoDate(coupon.expiresAt), isoDate(coupon.createdAt)]);
    count = total;
  }

  res.json({ success: true, tenantScoped: Boolean(scope.tenantId), type, count, previewLimit: limit, truncated: count > rows.length, columns, rows, summary, generatedAt: new Date().toISOString() });
});

module.exports = { generateReport, getReportTypes, previewReport };
