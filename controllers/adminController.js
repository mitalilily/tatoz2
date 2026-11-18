const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const Vendor = require('../models/Vendor');
const { parsePagination } = require('../utils/pagination');
const { assertProvider, assertProviders } = require('../services/providerSelectionService');
const { getTenantCustomerIds, getTenantUserIds, isUserInTenant } = require('../services/customerScopeService');
const { getSegmentMemberIds } = require('../services/customerSegmentService');
const { buildTenantAnalyticsScope, withTenant, withTenantUsers } = require('../services/tenantAnalyticsScope');
const { isGlobalAdmin } = require('../services/adminTenantScope');
const notificationDeliveryService = require('../services/notificationDeliveryService');
const Review = require('../models/Review');
const SupportTicket = require('../models/SupportTicket');
const ReturnRequest = require('../models/ReturnRequest');
const RefundRequest = require('../models/RefundRequest');
const DeviceToken = require('../models/DeviceToken');
const publicCache = require('../services/publicCache');

const NOTIFICATION_TYPES = new Set(['order', 'promo', 'system', 'alert', 'review']);
const NOTIFICATION_ROLES = new Set(['customer', 'affiliate', 'vendor', 'admin', 'superadmin']);
const MAX_NOTIFICATION_RECIPIENTS = 10000;

const notificationError = (message, statusCode = 400, publicCode = 'NOTIFICATION_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const resolveNotificationAudience = async ({ req, body = {} }) => {
  if (!req.tenant?._id) throw notificationError('Tenant context is required', 400, 'TENANT_REQUIRED');
  const requestedTarget = String(body.target || body.audienceType || 'all').trim().toLowerCase();
  const tenantUserIds = await getTenantUserIds(req.tenant._id);

  if (requestedTarget === 'all') {
    return { target: 'all', targetUsers: [], audience: { type: 'all', count: tenantUserIds.length } };
  }

  const role = requestedTarget === 'role'
    ? String(body.targetRole || '').trim().toLowerCase()
    : requestedTarget;
  if (NOTIFICATION_ROLES.has(role)) {
    const targetUsers = await User.find({ _id: { $in: tenantUserIds }, role }).distinct('_id');
    return { target: 'specific', targetUsers, audience: { type: 'role', role, count: targetUsers.length } };
  }

  if (requestedTarget === 'segment') {
    const segmentId = body.segmentId || body.targetSegment;
    if (!segmentId) throw notificationError('Select a customer segment', 400, 'NOTIFICATION_SEGMENT_REQUIRED');
    const targetUsers = await getSegmentMemberIds({ tenant: req.tenant._id, segmentId });
    if (targetUsers === null) throw notificationError('Customer segment not found in this tenant', 404, 'NOTIFICATION_SEGMENT_NOT_FOUND');
    if (targetUsers.length > MAX_NOTIFICATION_RECIPIENTS) throw notificationError('Notification audience is too large', 400, 'NOTIFICATION_AUDIENCE_TOO_LARGE');
    return { target: 'specific', targetUsers, audience: { type: 'segment', segmentId: String(segmentId), count: targetUsers.length } };
  }

  if (requestedTarget === 'specific') {
    const requestedUsers = Array.isArray(body.targetUsers) ? body.targetUsers : [];
    if (!requestedUsers.length) throw notificationError('At least one notification recipient is required', 400, 'NOTIFICATION_RECIPIENTS_REQUIRED');
    if (requestedUsers.length > MAX_NOTIFICATION_RECIPIENTS) throw notificationError('Notification audience is too large', 400, 'NOTIFICATION_AUDIENCE_TOO_LARGE');
    const allowed = new Set(tenantUserIds.map(userId => String(userId)));
    const targetUsers = Array.from(new Set(requestedUsers.map(String)));
    if (targetUsers.some(userId => !allowed.has(userId))) throw notificationError('Notification recipient is outside this tenant', 404, 'NOTIFICATION_RECIPIENT_OUTSIDE_TENANT');
    return { target: 'specific', targetUsers, audience: { type: 'specific', count: targetUsers.length } };
  }

  throw notificationError('Unsupported notification audience', 400, 'NOTIFICATION_AUDIENCE_INVALID');
};

// @desc    Get the compact admin dashboard payload. Detailed analytics live on /admin/analytics.
// @route   GET /api/admin/dashboard
const getDashboardStats = asyncHandler(async (req, res) => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const startOfDay = value => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const parseISODate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
    const date = new Date(`${value.trim()}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : startOfDay(date);
  };
  const toISODate = value => {
    const date = new Date(value);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  };

  const today = startOfDay(new Date());
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const fromParam = parseISODate(req.query.from);
  const toParam = parseISODate(req.query.to);

  let periodStart;
  let periodEndExclusive;
  if (fromParam || toParam) {
    if (!fromParam || !toParam) {
      res.status(400);
      throw new Error('Both "from" and "to" dates are required (YYYY-MM-DD)');
    }
    if (fromParam > toParam) {
      res.status(400);
      throw new Error('Invalid date range: "from" must be on or before "to"');
    }
    if (fromParam > today) {
      res.status(400);
      throw new Error('Invalid date range: "from" cannot be in the future');
    }
    const requestedDays = Math.round((toParam - fromParam) / DAY_MS) + 1;
    if (requestedDays > 366) {
      res.status(400);
      throw new Error('Date range is too large (maximum 366 days)');
    }
    periodStart = fromParam;
    const requestedEnd = new Date(toParam.getTime() + DAY_MS);
    periodEndExclusive = requestedEnd > tomorrow ? tomorrow : requestedEnd;
  } else {
    const requestedDays = Number(req.query.days);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
    periodStart = new Date(today.getTime() - days * DAY_MS);
    periodEndExclusive = tomorrow;
  }
  const periodDays = Math.max(1, Math.round((periodEndExclusive - periodStart) / DAY_MS));
  const prevPeriodStart = new Date(periodStart.getTime() - periodDays * DAY_MS);
  const analyticsScope = await buildTenantAnalyticsScope(req.tenant);

  const [
    totalUsers, newUsersToday, totalProducts, lowStockCount, outOfStockCount,
    totalOrders, ordersToday, pendingFulfillment, revenueData, revenueToday,
    prevRevenueData, recentOrders, salesPeriod, lowStockProducts, pendingVendors,
    ordersByStatus, paymentsBreakdown, topProducts, newCustomers,
    openTickets, pendingReviews, pendingReturns, pendingRefunds, totalVendors,
  ] = await Promise.all([
    User.countDocuments(withTenantUsers(analyticsScope, { role: 'customer' })),
    User.countDocuments(withTenantUsers(analyticsScope, { role: 'customer', createdAt: { $gte: today } })),
    Product.countDocuments(withTenant(analyticsScope, { isActive: true })),
    Product.countDocuments(withTenant(analyticsScope, { $expr: { $and: [{ $lte: ['$stock', '$lowStockThreshold'] }, { $gt: ['$stock', 0] }] }, isActive: true })),
    Product.countDocuments(withTenant(analyticsScope, { stock: { $lte: 0 }, isActive: true })),
    Order.countDocuments(withTenant(analyticsScope)),
    Order.countDocuments(withTenant(analyticsScope, { createdAt: { $gte: today } })),
    Order.countDocuments(withTenant(analyticsScope, { orderStatus: { $in: ['pending', 'confirmed', 'packed'] } })),
    Order.aggregate([{ $match: withTenant(analyticsScope, { paymentStatus: 'paid' }) }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: withTenant(analyticsScope, { paymentStatus: 'paid', createdAt: { $gte: today } }) }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([
      { $match: withTenant(analyticsScope, { createdAt: { $gte: prevPeriodStart, $lt: periodStart }, paymentStatus: 'paid' }) },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    Order.find(withTenant(analyticsScope)).sort({ createdAt: -1 }).limit(6).populate('user', 'name email'),
    Order.aggregate([
      { $match: withTenant(analyticsScope, { createdAt: { $gte: periodStart, $lt: periodEndExclusive }, paymentStatus: 'paid' }) },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Product.find(withTenant(analyticsScope, { $expr: { $and: [{ $lte: ['$stock', '$lowStockThreshold'] }, { $gt: ['$stock', 0] }] }, isActive: true }))
      .select('title thumbnail stock lowStockThreshold').sort({ stock: 1 }).limit(8),
    Vendor.countDocuments(withTenant(analyticsScope, { status: 'pending' })),
    Order.aggregate([
      { $match: withTenant(analyticsScope) },
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Order.aggregate([
      { $match: withTenant(analyticsScope) },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 }, total: { $sum: '$total' } } },
    ]),
    Order.aggregate([
      { $match: withTenant(analyticsScope, { createdAt: { $gte: periodStart, $lt: periodEndExclusive }, paymentStatus: 'paid' }) },
      { $unwind: '$items' },
      { $group: { _id: '$items.title', image: { $first: '$items.image' }, qty: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, title: '$_id', image: 1, qty: 1, revenue: 1 } },
    ]),
    User.find(analyticsScope.userIds ? { _id: { $in: analyticsScope.userIds }, role: 'customer' } : { role: 'customer' })
      .select('name email createdAt').sort({ createdAt: -1 }).limit(5),
    SupportTicket.countDocuments(withTenant(analyticsScope, { status: { $in: ['open', 'in_progress', 'waiting_customer'] } })),
    Review.countDocuments(withTenant(analyticsScope, { status: 'pending' })),
    ReturnRequest.countDocuments(withTenant(analyticsScope, { status: { $nin: ['rejected', 'closed', 'cancelled', 'refunded', 'replaced'] } })),
    RefundRequest.countDocuments(withTenant(analyticsScope, { status: 'pending' })),
    Vendor.countDocuments(withTenant(analyticsScope)),
  ]);

  const periodRevenue = salesPeriod.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const periodOrders = salesPeriod.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const paidCount = Number(revenueData[0]?.count || 0);

  res.json({
    success: true,
    stats: {
      users: { total: totalUsers, today: newUsersToday },
      products: {
        total: totalProducts,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
        healthy: Math.max(0, totalProducts - lowStockCount - outOfStockCount),
      },
      orders: {
        total: totalOrders,
        today: ordersToday,
        pending: pendingFulfillment,
        period: periodOrders,
        previousPeriod: Number(prevRevenueData[0]?.count || 0),
        byStatus: ordersByStatus,
      },
      revenue: {
        total: revenueData[0]?.total || 0,
        today: revenueToday[0]?.total || 0,
        period: periodRevenue,
        previousPeriod: Number(prevRevenueData[0]?.total || 0),
        avgOrderValue: paidCount > 0 ? Number(revenueData[0].total || 0) / paidCount : 0,
      },
      payments: paymentsBreakdown,
      vendors: { total: totalVendors, pending: pendingVendors },
      support: { openTickets },
      reviews: { pending: pendingReviews },
      returns: { pending: pendingReturns },
      refunds: { pending: pendingRefunds },
    },
    recentOrders,
    newCustomers,
    topProducts,
    lowStockProducts,
    salesPeriod,
    salesPeriodDays: periodDays,
    period: {
      from: toISODate(periodStart),
      to: toISODate(new Date(periodEndExclusive.getTime() - 1)),
      days: periodDays,
    },
    generatedAt: new Date().toISOString(),
  });
});

// @desc    Get all users (admin)
// @route   GET /api/admin/users
const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { role, search, isActive, segment, tag, customerSegment } = req.query;
  const query = {};
  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (segment) query.segment = segment;
  if (tag) query.tags = tag;
  if (search) {
    const escaped = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const tenantIds = isGlobalAdmin(req)
    ? req.adminTenantIds
    : (req.tenant ? [req.tenant._id] : []);
  if (tenantIds.length) {
    let tenantUserIds = (await Promise.all(tenantIds.map(tenantId => getTenantUserIds(tenantId)))).flat();
    if (customerSegment) {
      const segmentUserIds = (await Promise.all(tenantIds.map(tenant => getSegmentMemberIds({ tenant, segmentId: customerSegment })))).flat().filter(Boolean);
      const segmentSet = new Set(segmentUserIds.map(String));
      tenantUserIds = segmentUserIds.length
        ? tenantUserIds.filter(userId => segmentSet.has(String(userId)))
        : [];
    }
    query._id = { $in: Array.from(new Map(tenantUserIds.map(id => [String(id), id])).values()) };
  }

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .select('-password -resetPasswordToken -twoFactorSecret')
    .sort({ createdAt: -1 }).skip(skip).limit(limit);

  res.json({ success: true, users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// @desc    Update user status (admin)
// @route   PUT /api/admin/users/:id
const updateUser = asyncHandler(async (req, res) => {
  const { isActive, role, tags } = req.body;
  const update = {};
  if (req.tenant && !isGlobalAdmin(req) && !(await isUserInTenant({ tenant: req.tenant._id, userId: req.params.id }))) {
    res.status(404);
    throw new Error('User is not available in this tenant');
  }
  if (isActive !== undefined) update.isActive = isActive;
  if (role) {
    if (req.user.role !== 'superadmin') {
      res.status(403);
      throw new Error('Only a super admin can change roles');
    }
    if (!['customer', 'vendor', 'admin', 'superadmin', 'affiliate'].includes(role)) {
      res.status(400);
      throw new Error('Invalid user role');
    }
    if (String(req.user._id) === String(req.params.id) && role !== 'superadmin') {
      res.status(400);
      throw new Error('A super admin cannot remove their own super admin role');
    }
    update.role = role;
  }
  if (tags !== undefined) update.tags = tags;
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!user) { res.status(404); throw new Error('User not found'); }
  res.json({ success: true, user });
});

// @desc    Get segment counts (admin)
// @route   GET /api/admin/users/segments
const getSegmentCounts = asyncHandler(async (req, res) => {
  const match = { role: 'customer' };
  const tenantIds = isGlobalAdmin(req)
    ? req.adminTenantIds
    : (req.tenant ? [req.tenant._id] : []);
  if (tenantIds.length) {
    const customerIds = (await Promise.all(tenantIds.map(tenant => getTenantCustomerIds(tenant)))).flat();
    match._id = { $in: Array.from(new Map(customerIds.map(id => [String(id), id])).values()) };
  }
  const counts = await User.aggregate([
    { $match: match },
    { $group: { _id: '$segment', count: { $sum: 1 } } },
  ]);
  const segments = {};
  counts.forEach(c => { segments[c._id || 'new'] = c.count; });
  res.json({ success: true, segments });
});

// @desc    Get platform settings
// @route   GET /api/admin/settings
const getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.find({
    group: { $ne: 'secret' },
    key: { $nin: ['ai_credits', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD', 'SHIPROCKET_WEBHOOK_SECRET', 'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'GOOGLE_CLIENT_ID', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM'] },
  });
  const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
  res.json({ success: true, settings: settingsMap });
});

// @desc    Update settings
// @route   PUT /api/admin/settings
const updateSettings = asyncHandler(async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    res.status(400);
    throw new Error('settings must be an object');
  }
  const legacyCredentialKeys = new Set([
    'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
    'SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD', 'SHIPROCKET_WEBHOOK_SECRET', 'SHIPROCKET_PICKUP_LOCATION',
    'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'GOOGLE_CLIENT_ID', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM',
  ]);
  if (Object.keys(settings).some(key => legacyCredentialKeys.has(key))) {
    res.status(400);
    throw new Error('Provider credentials must be managed from Admin → Modules');
  }
  if (Object.keys(settings).includes('ai_credits')) {
    res.status(400);
    throw new Error('AI credits are system-managed and cannot be changed from the admin panel');
  }
  const normalizedSettings = { ...settings };
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'active_payment_provider') normalizedSettings[key] = value === null || String(value || '').trim() === '' ? null : assertProvider('payment', value);
    if (key === 'active_payment_providers') normalizedSettings[key] = value === null ? [] : assertProviders('payment', value, { allowEmpty: true });
    if (key === 'active_shipping_provider') normalizedSettings[key] = value === null || String(value || '').trim() === '' ? null : assertProvider('shipping', value);
  }
  const hasPaymentProviders = Object.prototype.hasOwnProperty.call(settings, 'active_payment_providers');
  const hasPaymentProvider = Object.prototype.hasOwnProperty.call(settings, 'active_payment_provider');
  if (hasPaymentProviders) {
    normalizedSettings.active_payment_provider = normalizedSettings.active_payment_providers[0] || null;
  } else if (hasPaymentProvider) {
    normalizedSettings.active_payment_providers = normalizedSettings.active_payment_provider ? [normalizedSettings.active_payment_provider] : [];
  }
  for (const [key, value] of Object.entries(normalizedSettings)) {
    await Settings.set(key, value);
  }
  await publicCache.invalidate(req, { namespace: 'site' });
  res.json({ success: true, message: 'Settings updated' });
});

// @desc    Create notification
// @route   POST /api/admin/notifications
const createNotification = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!title || !message) throw notificationError('Title and message are required', 400, 'NOTIFICATION_CONTENT_REQUIRED');
  if (title.length > 160) throw notificationError('Notification title must be 160 characters or fewer', 400, 'NOTIFICATION_TITLE_TOO_LONG');
  if (message.length > 4000) throw notificationError('Notification message must be 4000 characters or fewer', 400, 'NOTIFICATION_MESSAGE_TOO_LONG');
  const audience = await resolveNotificationAudience({ req, body: req.body });
  const requestedType = String(req.body?.type || 'promo').trim().toLowerCase();
  const type = NOTIFICATION_TYPES.has(requestedType) ? requestedType : 'promo';
  const channels = {
    email: Boolean(req.body?.channels?.email),
    push: Boolean(req.body?.channels?.push),
    sms: Boolean(req.body?.channels?.sms),
  };
  const notification = await Notification.create({
    tenant: req.tenant._id,
    title,
    message,
    type,
    target: audience.target,
    targetUsers: audience.targetUsers,
    targetRole: audience.audience.type === 'role' ? audience.audience.role : undefined,
    channels,
    data: { audience: audience.audience, source: 'admin' },
    sentAt: new Date(),
    status: 'sent',
  });
  // Keep the in-app notification authoritative, while external channels are
  // queued through the same consent-aware outbox used by campaigns.
  const recipientIds = audience.target === 'all'
    ? await getTenantUserIds(req.tenant._id)
    : audience.targetUsers;
  const recipients = await User.find({ _id: { $in: recipientIds || [] }, isActive: true })
    .select('_id email phone notificationPrefs').lean();
  const deliverySummary = { queued: 0, skipped: 0 };
  for (const user of recipients) {
    const channelRecipients = [];
    if (channels.email && user.email) channelRecipients.push({ channel: 'email', recipient: user.email, email: user.email });
    if (channels.sms && user.phone) channelRecipients.push({ channel: 'sms', recipient: user.phone });
    if (channels.push) {
      const tokens = await DeviceToken.find({ tenant: req.tenant._id, user: user._id, invalidatedAt: null }).select('token').lean();
      tokens.forEach(token => channelRecipients.push({ channel: 'push', recipient: token.token }));
    }
    for (const delivery of channelRecipients) {
      try {
        await notificationDeliveryService.send({
          tenant: req.tenant._id,
          channel: delivery.channel,
          recipient: delivery.recipient,
          email: delivery.email,
          userId: user._id,
          purpose: 'marketing',
          eventType: `admin.notification.${notification._id}`,
          idempotencyKey: `admin-notification:${notification._id}:${user._id}:${delivery.channel}:${delivery.recipient}`,
          title,
          body: message,
          subject: title,
          html: `<p>${message.replace(/\n/g, '<br />')}</p>`,
          data: { notificationId: String(notification._id) },
        });
        deliverySummary.queued += 1;
      } catch (_) { deliverySummary.skipped += 1; }
    }
  }
  res.status(201).json({ success: true, notification, audience: audience.audience, deliverySummary });
});

// @desc    Preview a notification audience without creating a notification
// @route   POST /api/admin/notifications/preview
const previewNotificationAudience = asyncHandler(async (req, res) => {
  const { audience } = await resolveNotificationAudience({ req, body: req.body });
  res.json({ success: true, audience });
});

// @desc    Get notifications (admin)
// @route   GET /api/admin/notifications
const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find(req.tenant ? { tenant: req.tenant._id } : {}).sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, notifications });
});

// @desc    Get sales analytics
// @route   GET /api/admin/analytics/sales
const getSalesAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;
  const analyticsScope = await buildTenantAnalyticsScope(req.tenant);
  const match = withTenant(analyticsScope, { paymentStatus: 'paid' });

  // Default to last 30 days if no range given
  const now = new Date();
  const defaultEnd = now.toISOString().split('T')[0];
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const from = startDate || defaultStart;
  const to = endDate || defaultEnd;

  match.createdAt = {};
  match.createdAt.$gte = new Date(from + 'T00:00:00.000Z');
  // End of day (inclusive): use start of next day with $lt so the full 'to' day is included
  const toEnd = new Date(to + 'T00:00:00.000Z');
  toEnd.setUTCDate(toEnd.getUTCDate() + 1);
  match.createdAt.$lt = toEnd;

  const dateFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-W%V' : '%Y-%m-%d';

  const [salesData, categoryData, paymentMethodData, productData] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 }, avgOrder: { $avg: '$total' } } },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $lookup: { from: 'categories', localField: 'product.category', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $group: { _id: '$category.name', revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }, count: { $sum: '$items.quantity' } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', units: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
      { $sort: { revenue: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { _id: 1, title: '$product.title', thumbnail: '$product.thumbnail', price: '$product.price', units: 1, revenue: 1 } },
    ]),
  ]);

  const totalRevenue = salesData.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const totalOrders = salesData.reduce((sum, item) => sum + Number(item.orders || 0), 0);
  const bestDay = salesData.reduce((best, item) => Number(item.revenue || 0) > Number(best?.revenue || 0) ? item : best, null);

  res.json({
    success: true,
    salesData,
    categoryData,
    paymentMethodData,
    productData,
    summary: {
      totalRevenue,
      totalOrders,
      avgOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
      unitsSold: productData.reduce((sum, item) => sum + Number(item.units || 0), 0),
      topCategory: categoryData[0]?._id || null,
      topPaymentMethod: paymentMethodData[0]?._id || null,
      bestDay: bestDay ? { date: bestDay._id, revenue: bestDay.revenue, orders: bestDay.orders } : null,
      from,
      to,
      groupBy,
    },
  });
});

// @desc    Update category commission rate
// @route   PUT /api/admin/categories/:id/commission
const updateCategoryCommission = asyncHandler(async (req, res) => {
  const { commissionRate } = req.body;
  const Category = require('../models/Category');
  const numericRate = Number(commissionRate);
  if (!Number.isFinite(numericRate) || numericRate < 0 || numericRate > 100) {
    res.status(400);
    throw new Error('Commission rate must be between 0 and 100');
  }
  const category = await Category.findOne({ _id: req.params.id, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (!category) { res.status(404); throw new Error('Category not found'); }
  category.commissionRate = numericRate;
  await category.save();
  await publicCache.invalidate(req, { namespace: 'categories' });
  res.json({ success: true, data: category });
});

// @desc    Update global default commission
// @route   PUT /api/admin/settings/commission-default
const updateDefaultCommission = asyncHandler(async (req, res) => {
  const Settings = require('../models/Settings');
  const { commissionRate } = req.body;
  await Settings.set('defaultCommissionRate', commissionRate, 'marketplace');
  res.json({ success: true, message: 'Default commission rate updated' });
});

module.exports = { getDashboardStats, getUsers, updateUser, getSegmentCounts, getSettings, updateSettings, createNotification, previewNotificationAudience, getNotifications, getSalesAnalytics, updateCategoryCommission, updateDefaultCommission };
