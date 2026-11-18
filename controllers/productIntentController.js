const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const User = require('../models/User');
const StockAlert = require('../models/StockAlert');
const PriceDropAlert = require('../models/PriceDropAlert');

// @desc    Tenant-scoped wishlist and product-alert analytics
// @route   GET /api/admin/product-intents
const getProductIntentAnalytics = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const tenant = req.tenant._id;
  const products = await Product.find({ tenant }).select('_id title slug thumbnail price stock isActive').lean();
  const productIds = products.map(product => product._id);

  const [wishlistRows, stockRows, priceRows] = await Promise.all([
    User.aggregate([
      { $match: { role: 'customer', wishlist: { $in: productIds } } },
      { $unwind: '$wishlist' },
      { $match: { wishlist: { $in: productIds } } },
      { $group: { _id: '$wishlist', count: { $sum: 1 } } },
    ]),
    StockAlert.aggregate([
      { $match: { tenant, notified: false, product: { $in: productIds } } },
      { $group: { _id: '$product', count: { $sum: 1 } } },
    ]),
    PriceDropAlert.aggregate([
      { $match: { tenant, status: 'active', product: { $in: productIds } } },
      { $group: { _id: '$product', count: { $sum: 1 } } },
    ]),
  ]);

  const countMap = rows => new Map(rows.map(row => [String(row._id), row.count]));
  const wishlistCounts = countMap(wishlistRows);
  const stockCounts = countMap(stockRows);
  const priceCounts = countMap(priceRows);
  const rows = products.map(product => ({
    product: { _id: product._id, title: product.title, slug: product.slug, thumbnail: product.thumbnail, price: product.price, stock: product.stock, isActive: product.isActive },
    wishlistCount: wishlistCounts.get(String(product._id)) || 0,
    backInStockSubscribers: stockCounts.get(String(product._id)) || 0,
    priceDropSubscribers: priceCounts.get(String(product._id)) || 0,
  })).sort((left, right) => (
    right.wishlistCount - left.wishlistCount
    || right.backInStockSubscribers - left.backInStockSubscribers
    || right.priceDropSubscribers - left.priceDropSubscribers
    || left.product.title.localeCompare(right.product.title)
  ));
  const signalRows = rows.filter(row => (
    row.wishlistCount > 0
    || row.backInStockSubscribers > 0
    || row.priceDropSubscribers > 0
  ));

  res.json({
    success: true,
    summary: {
      wishlistItems: rows.reduce((sum, row) => sum + row.wishlistCount, 0),
      wishlistCustomers: wishlistRows.length,
      backInStockSubscribers: rows.reduce((sum, row) => sum + row.backInStockSubscribers, 0),
      priceDropSubscribers: rows.reduce((sum, row) => sum + row.priceDropSubscribers, 0),
    },
    // A demand table should represent demand, not a catalogue dump of
    // alphabetically ordered zero rows. The summary still communicates the
    // all-zero state through its counters and the UI renders an empty state.
    products: signalRows.slice(0, 100),
  });
});

module.exports = { getProductIntentAnalytics };
