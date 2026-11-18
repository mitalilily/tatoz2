const asyncHandler = require('express-async-handler');
const AbandonedCart = require('../models/AbandonedCart');

function detectDevice(ua) {
  if (!ua) return 'unknown';
  if (/mobile/i.test(ua)) return 'mobile';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  return 'desktop';
}

// @desc    Sync cart state from client (public, lightweight)
// @route   POST /api/cart/sync
const syncCart = asyncHandler(async (req, res) => {
  const { items, couponCode, referralCode } = req.body;
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return res.status(400).json({ success: false, message: 'Session ID required' });

  // If cart is empty, remove the abandoned cart record
  if (!items || items.length === 0) {
    await AbandonedCart.deleteOne({ sessionId });
    return res.json({ success: true });
  }

  const cartItems = items.map(i => ({
    product: i.product?._id || i.product,
    title: i.product?.title || i.title || '',
    thumbnail: i.product?.thumbnail || i.thumbnail || '',
    price: i.price || 0,
    quantity: i.quantity || 1,
    variant: i.variant || null,
  }));

  const itemCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = cartItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  await AbandonedCart.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        user: req.user?._id || null,
        items: cartItems,
        itemCount,
        subtotal,
        couponCode: couponCode || null,
        referralCode: referralCode || null,
        lastActivity: new Date(),
        device: detectDevice(req.headers['user-agent']),
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
    },
    { upsert: true }
  );

  res.json({ success: true });
});

// @desc    Mark cart as recovered (called after order placement)
// @route   POST /api/cart/recovered
const markRecovered = asyncHandler(async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return res.json({ success: true });

  await AbandonedCart.findOneAndUpdate(
    { sessionId },
    { $set: { recovered: true, recoveredAt: new Date() } }
  );

  res.json({ success: true });
});

// @desc    Get abandoned carts (admin)
// @route   GET /api/admin/abandoned-carts
const getAbandonedCarts = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20,
    sort = 'newest', minValue, maxValue,
    recovered, search, minItems,
    hoursAgo,
  } = req.query;

  const match = {};

  // By default show only non-recovered carts with items
  if (recovered === 'true') match.recovered = true;
  else if (recovered === 'all') { /* no filter */ }
  else match.recovered = false;

  match.itemCount = { $gt: 0 };

  if (minValue || maxValue) {
    match.subtotal = {};
    if (minValue) match.subtotal.$gte = Number(minValue);
    if (maxValue) match.subtotal.$lte = Number(maxValue);
  }

  if (minItems) {
    match.itemCount.$gte = Number(minItems);
  }

  if (hoursAgo) {
    match.lastActivity = { $lte: new Date(Date.now() - Number(hoursAgo) * 60 * 60 * 1000) };
  }

  const sortOptions = {
    newest: { lastActivity: -1 },
    oldest: { lastActivity: 1 },
    highest_value: { subtotal: -1 },
    most_items: { itemCount: -1 },
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;
  const skip = (Number(page) - 1) * Number(limit);

  // Search by user name/email
  let userMatch = {};
  if (search) {
    const User = require('../models/User');
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    }).select('_id');
    userMatch = { user: { $in: matchingUsers.map(u => u._id) } };
  }

  const finalMatch = search ? { ...match, ...userMatch } : match;

  const [carts, total, stats] = await Promise.all([
    AbandonedCart.find(finalMatch)
      .sort(sortBy)
      .skip(skip)
      .limit(Number(limit))
      .populate('user', 'name email phone avatar')
      .populate('items.product', 'title slug thumbnail images price discount stock')
      .lean(),
    AbandonedCart.countDocuments(finalMatch),
    // Aggregate stats
    AbandonedCart.aggregate([
      { $match: { recovered: false, itemCount: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalCarts: { $sum: 1 },
          totalValue: { $sum: '$subtotal' },
          avgValue: { $avg: '$subtotal' },
          totalItems: { $sum: '$itemCount' },
        },
      },
    ]),
  ]);

  // Recovery stats
  const [recoveryStats] = await AbandonedCart.aggregate([
    { $match: { itemCount: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        recovered: { $sum: { $cond: ['$recovered', 1, 0] } },
        abandonedValue: { $sum: { $cond: [{ $eq: ['$recovered', false] }, '$subtotal', 0] } },
        recoveredValue: { $sum: { $cond: ['$recovered', '$subtotal', 0] } },
      },
    },
  ]);

  res.json({
    success: true,
    carts,
    total,
    pagination: { page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    stats: stats[0] || { totalCarts: 0, totalValue: 0, avgValue: 0, totalItems: 0 },
    recoveryStats: recoveryStats || { total: 0, recovered: 0, abandonedValue: 0, recoveredValue: 0 },
  });
});

module.exports = { syncCart, markRecovered, getAbandonedCarts };
