const asyncHandler = require('express-async-handler');
const ClickEvent = require('../models/ClickEvent');
const { getAIClient, getAIModel } = require('../services/aiService');
const { startAIUsage } = require('../services/aiUsageService');
const { AI_CREDIT_COSTS, roundCredits } = require('../config/aiCreditCosts');

const EVENT_TYPES = new Set([
  'page_view', 'product_click', 'category_click', 'search', 'add_to_cart',
  'remove_from_cart', 'wishlist_toggle', 'checkout_start', 'order_placed',
  'button_click', 'nav_click', 'filter_change', 'sort_change', 'login',
  'register', 'logout', 'other',
]);

function detectDevice(ua) {
  if (!ua) return 'unknown';
  if (/mobile/i.test(ua)) return 'mobile';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  return 'desktop';
}

function buildDateRange(startDate, endDate, fallbackDays = 30) {
  const now = new Date();
  const end = endDate ? new Date(`${endDate}T00:00:00.000Z`) : now;
  if (endDate) end.setUTCDate(end.getUTCDate() + 1);
  const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date(end.getTime() - fallbackDays * 24 * 60 * 60 * 1000);
  return { $gte: start, $lt: end };
}

function mergeLowerBound(range, lowerBound) {
  return range.$gte > lowerBound ? range.$gte : lowerBound;
}

const boundedString = (value, max = 500) => value == null ? undefined : String(value).slice(0, max);
const boundedMetadata = (value) => {
  if (value == null) return undefined;
  try {
    const json = JSON.stringify(value);
    return json.length <= 4000 ? JSON.parse(json) : { truncated: true };
  } catch (_) {
    return { truncated: true };
  }
};

// @desc    Record a click event (public, lightweight)
// @route   POST /api/track
const trackEvent = asyncHandler(async (req, res) => {
  const { eventType, page, target, targetId, metadata } = req.body;
  if (!eventType || typeof eventType !== 'string' || eventType.length > 64 || !EVENT_TYPES.has(eventType)) {
    return res.status(400).json({ success: false, message: 'Valid eventType required' });
  }

  const event = {
    eventType,
    page: boundedString(page),
    target: boundedString(target),
    targetId: boundedString(targetId, 100),
    metadata: boundedMetadata(metadata),
    tenant: req.tenant?._id || null,
    userId: req.user?._id || null,
    sessionId: req.headers['x-session-id'] || null,
    userAgent: req.headers['user-agent'],
    device: detectDevice(req.headers['user-agent']),
    referrer: req.headers.referer || req.headers.referrer || null,
    ip: req.ip,
  };

  // Do not make storefront navigation wait on analytics persistence. The
  // bounded event is still written immediately on the event loop and failures
  // are observable without turning telemetry into a user-facing outage.
  setImmediate(() => ClickEvent.create(event).catch(error => console.warn('[click-tracking] write failed:', error.message)));

  res.json({ success: true });
});

// @desc    Get click tracking analytics (admin)
// @route   GET /api/admin/click-tracking
const getClickAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, eventType } = req.query;

  const match = { createdAt: buildDateRange(startDate, endDate, 30) };
  if (eventType) match.eventType = eventType;
  const hourlyMatch = {
    ...match,
    createdAt: {
      $gte: mergeLowerBound(match.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      $lt: match.createdAt.$lt,
    },
  };

  const [
    total,
    eventTypeBreakdown,
    pageBreakdown,
    deviceBreakdown,
    hourlyBreakdown,
    topProducts,
    topSearches,
    dailyTrend,
    referrerBreakdown,
  ] = await Promise.all([
    // Total count
    ClickEvent.countDocuments(match),
    // Breakdown by event type
    ClickEvent.aggregate([
      { $match: match },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    // Top pages
    ClickEvent.aggregate([
      { $match: match },
      { $group: { _id: '$page', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    // Device breakdown
    ClickEvent.aggregate([
      { $match: match },
      { $group: { _id: '$device', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    // Hourly breakdown (last 24h)
    ClickEvent.aggregate([
      { $match: hourlyMatch },
      { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } },
    ]),
    // Top product clicks
    ClickEvent.aggregate([
      { $match: { ...match, eventType: 'product_click', target: { $nin: [null, ''] } } },
      { $group: { _id: '$target', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    // Top searches
    ClickEvent.aggregate([
      { $match: { ...match, eventType: 'search', target: { $nin: [null, ''] } } },
      { $group: { _id: '$target', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    // Daily trend for the selected period
    ClickEvent.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } },
    ]),
    // Traffic sources
    ClickEvent.aggregate([
      { $match: { ...match, referrer: { $nin: [null, ''] } } },
      { $group: { _id: '$referrer', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  // Unique sessions & users
  const [uniqueSessionResult, uniqueUserResult] = await Promise.all([
    ClickEvent.aggregate([{ $match: { ...match, sessionId: { $nin: [null, ''] } } }, { $group: { _id: '$sessionId' } }, { $count: 'count' }]).allowDiskUse(true),
    ClickEvent.aggregate([{ $match: { ...match, userId: { $ne: null } } }, { $group: { _id: '$userId' } }, { $count: 'count' }]).allowDiskUse(true),
  ]);
  const uniqueSessions = uniqueSessionResult[0]?.count || 0;
  const uniqueUsers = uniqueUserResult[0]?.count || 0;
  const eventCounts = Object.fromEntries(eventTypeBreakdown.map((item) => [item._id, item.count]));
  const funnelSteps = [
    ['page_view', 'Page views'],
    ['product_click', 'Product clicks'],
    ['add_to_cart', 'Add to cart'],
    ['checkout_start', 'Checkout started'],
    ['order_placed', 'Orders placed'],
  ].map(([key, label]) => ({ key, label, count: eventCounts[key] || 0 }));
  const pageViews = funnelSteps[0].count;

  res.json({
    success: true,
    total,
    stats: {
      totalEvents: total,
      uniqueSessions,
      uniqueUsers,
      conversionRate: pageViews ? Number(((eventCounts.order_placed || 0) / pageViews * 100).toFixed(2)) : 0,
      engagementRate: total ? Number((((total - (eventCounts.page_view || 0)) / total) * 100).toFixed(2)) : 0,
    },
    eventTypeBreakdown,
    pageBreakdown,
    deviceBreakdown,
    hourlyBreakdown,
    topProducts,
    topSearches,
    dailyTrend,
    referrerBreakdown,
    funnel: { steps: funnelSteps, conversionRate: pageViews ? Number(((eventCounts.order_placed || 0) / pageViews * 100).toFixed(2)) : 0 },
  });
});

// @desc    AI summary of click tracking data (admin)
// @route   POST /api/admin/click-tracking/summary
const getAISummary = asyncHandler(async (req, res) => {
  const Settings = require('../models/Settings');
  const AI_CREDIT_COST = AI_CREDIT_COSTS.clickTracking;
  const { startDate, endDate, eventType } = req.body || {};
  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'click_tracking', action: 'summarize_click_analytics', credits: AI_CREDIT_COST, model, metadata: { eventType: eventType || 'all', hasCustomRange: Boolean(startDate || endDate) } });

  // Check and deduct AI credits
  const credits = Number(await Settings.get('ai_credits', 0));
  if (credits < AI_CREDIT_COST) {
    res.status(402);
    await usage.finish({ status: 'rejected', error: `Insufficient AI credits. Need ${AI_CREDIT_COST}` });
    throw new Error(`Insufficient AI credits. You have ${credits} credits but need ${AI_CREDIT_COST}. Please top up.`);
  }
  await Settings.set('ai_credits', roundCredits(credits - AI_CREDIT_COST), 'ai');
  usage.charge(AI_CREDIT_COST);

  const selectedRange = buildDateRange(startDate, endDate, 7);
  const summaryMatch = { createdAt: selectedRange };
  if (eventType) summaryMatch.eventType = eventType;
  const periodLabel = `${startDate || 'last 7 days'} to ${endDate || 'today'}`;

  const [totalEvents, eventTypes, topPages, topProducts, topSearches, deviceBreakdown, dailyTrend, uniqueSessions, uniqueUsers] = await Promise.all([
    ClickEvent.countDocuments(summaryMatch),
    ClickEvent.aggregate([
      { $match: summaryMatch },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ClickEvent.aggregate([
      { $match: summaryMatch },
      { $group: { _id: '$page', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    ClickEvent.aggregate([
      { $match: { ...summaryMatch, eventType: 'product_click' } },
      { $group: { _id: '$target', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    ClickEvent.aggregate([
      { $match: { ...summaryMatch, eventType: 'search' } },
      { $group: { _id: '$target', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    ClickEvent.aggregate([
      { $match: summaryMatch },
      { $group: { _id: '$device', count: { $sum: 1 } } },
    ]),
    ClickEvent.aggregate([
      { $match: summaryMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } },
    ]),
    ClickEvent.aggregate([{ $match: { ...summaryMatch, sessionId: { $nin: [null, ''] } } }, { $group: { _id: '$sessionId' } }, { $count: 'count' }]).allowDiskUse(true),
    ClickEvent.aggregate([{ $match: { ...summaryMatch, userId: { $ne: null } } }, { $group: { _id: '$userId' } }, { $count: 'count' }]).allowDiskUse(true),
  ]);

  const analyticsData = {
    period: periodLabel,
    totalEvents,
    uniqueSessions: uniqueSessions[0]?.count || 0,
    uniqueUsers: uniqueUsers[0]?.count || 0,
    eventTypes,
    topPages,
    topProducts,
    topSearches,
    deviceBreakdown,
    dailyTrend,
  };

  let completion;
  try {
    const client = await getAIClient();
    completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert e-commerce analytics consultant. Analyze the click tracking data and provide actionable insights. Be concise, use bullet points, and highlight key patterns, anomalies, and recommendations. Format with markdown.',
        },
        {
          role: 'user',
          content: `Here is the click tracking analytics data for our e-commerce store for ${periodLabel}:\n\n${JSON.stringify(analyticsData, null, 2)}\n\nProvide a summary covering:\n1. Overall traffic health & trends\n2. User behavior patterns (what pages/products get most attention)\n3. Conversion funnel analysis (page views → product clicks → add to cart → checkout → orders)\n4. Device usage insights\n5. Search behavior (what are users looking for?)\n6. Top 3 actionable recommendations to improve conversions`,
        },
      ],
      max_tokens: 1500,
    });
  } catch (err) {
    // Refund credits on AI failure
    const current = Number(await Settings.get('ai_credits', 0));
    await Settings.set('ai_credits', roundCredits(current + AI_CREDIT_COST), 'ai');
    usage.refund(AI_CREDIT_COST);
    await usage.finish({ status: 'failed', error: err.message });
    throw err;
  }

  const remainingCredits = Number(await Settings.get('ai_credits', 0));
  await usage.finish({ usage: completion.usage, extraMetadata: { totalEvents: analyticsData.totalEvents, period: periodLabel } });

  res.json({
    success: true,
    summary: completion.choices[0].message.content,
    data: analyticsData,
    remainingCredits,
    aiCredits: remainingCredits,
  });
});

module.exports = { trackEvent, getClickAnalytics, getAISummary };
