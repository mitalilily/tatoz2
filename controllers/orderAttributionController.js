const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const ClickEvent = require('../models/ClickEvent');
const ReferralTracking = require('../models/ReferralTracking');

const UTM_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'source', 'medium', 'campaign', 'term', 'content', 'landingPage',
  'firstPage', 'lastPage', 'firstSeenAt', 'lastSeenAt', 'referrer',
];

const compactUtm = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return UTM_KEYS.reduce((result, key) => {
    if (value[key] !== undefined && value[key] !== null && String(value[key]).trim()) {
      result[key] = String(value[key]).slice(0, 500);
    }
    return result;
  }, {});
};

const eventScope = tenantId => tenantId
  ? { tenant: { $in: [tenantId, null] } }
  : {};

const eventSnapshot = event => ({
  eventType: event.eventType,
  page: event.page || '',
  target: event.target || '',
  targetId: event.targetId || '',
  metadata: event.metadata || {},
  sessionId: event.sessionId || '',
  device: event.device || 'unknown',
  referrer: event.referrer || '',
  createdAt: event.createdAt,
});

const firstDefined = (...values) => values.find(value => value !== undefined && value !== null && String(value).trim()) || '';

// @desc    Get the full storefront-to-order attribution journey
// @route   GET /api/admin/orders/:id/attribution
const getOrderAttribution = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404);
    throw new Error('Order not found');
  }

  const order = await Order.findOne({
    _id: req.params.id,
    ...(req.tenant ? { tenant: req.tenant._id } : {}),
  }).select('orderNumber orderStatus total createdAt user guestEmail trackingSessionId utm referralCode referralSource referralTracking').lean();
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const orderCreatedAt = new Date(order.createdAt || Date.now());
  const eventRange = {
    $gte: new Date(orderCreatedAt.getTime() - (90 * 24 * 60 * 60 * 1000)),
    // The server writes the order_placed event immediately after checkout;
    // allow a short post-order window so that event is included in the journey.
    $lte: new Date(orderCreatedAt.getTime() + (15 * 60 * 1000)),
  };
  const scope = eventScope(req.tenant?._id);
  const sessionId = firstDefined(order.trackingSessionId, order.utm?.sessionId, order.utm?.session_id);
  const userId = order.user && mongoose.isValidObjectId(order.user) ? order.user : null;

  let events = [];
  if (sessionId) {
    events = await ClickEvent.find({ ...scope, sessionId, createdAt: eventRange })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();
  }
  // Legacy orders may not have a persisted session ID. User-scoped fallback
  // keeps their journey visible while the time window prevents unrelated old
  // activity from being attached to the order.
  if (!events.length && userId) {
    events = await ClickEvent.find({ ...scope, userId, createdAt: eventRange })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();
  }

  const referral = await ReferralTracking.findOne({
    ...(req.tenant ? { tenant: req.tenant._id } : {}),
    $or: [
      { order: order._id, type: 'conversion' },
      ...(order.referralTracking ? [{ _id: order.referralTracking }] : []),
    ],
  }).sort({ createdAt: -1 }).lean();

  const snapshots = events.map(eventSnapshot);
  const pageViews = snapshots.filter(event => event.eventType === 'page_view');
  const firstTouch = pageViews[0] || snapshots[0] || null;
  const lastTouch = pageViews[pageViews.length - 1] || snapshots[snapshots.length - 1] || null;
  const utm = compactUtm(order.utm);
  const source = firstDefined(
    utm.utm_source,
    utm.source,
    order.referralSource,
    referral?.code,
    referral?.referrer,
    firstTouch?.referrer,
    'direct',
  );
  const medium = firstDefined(utm.utm_medium, utm.medium, referral ? 'referral' : '');
  const campaign = firstDefined(utm.utm_campaign, utm.campaign);

  res.json({
    success: true,
    attribution: {
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        total: order.total,
        createdAt: order.createdAt,
      },
      sessionId: sessionId || firstDefined(lastTouch?.sessionId),
      source,
      medium,
      campaign,
      term: firstDefined(utm.utm_term, utm.term),
      content: firstDefined(utm.utm_content, utm.content),
      landingPage: firstDefined(utm.landingPage, utm.firstPage, firstTouch?.page),
      referrer: firstDefined(utm.referrer, referral?.referrer, firstTouch?.referrer),
      utm,
      referral: referral ? {
        code: referral.code || '',
        type: referral.type || '',
        landingPage: referral.landingPage || '',
        referrer: referral.referrer || '',
        attributionModel: referral.attributionModel || '',
        createdAt: referral.createdAt,
      } : null,
      firstTouch,
      lastTouch,
      eventCount: snapshots.length,
      events: snapshots,
    },
  });
});

module.exports = { getOrderAttribution };
