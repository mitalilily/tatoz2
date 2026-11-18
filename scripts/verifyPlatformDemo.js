require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Tenant = require('../models/Tenant');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const User = require('../models/User');
const TenantCustomer = require('../models/TenantCustomer');
const Review = require('../models/Review');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const PaymentAttempt = require('../models/PaymentAttempt');
const Shipment = require('../models/Shipment');

const check = async () => {
  await connectDB();
  const tenant = await Tenant.findOne({ key: 'platform' }).lean();
  const categories = await Category.find({ tenant: tenant?._id, slug: /^demo-/ }).lean();
  const brands = await Brand.find({ tenant: tenant?._id, slug: /^demo-/ }).lean();
  const products = await Product.find({ tenant: tenant?._id, slug: /^demo-/ }).lean();
  const users = await User.find({ email: /^demo\.customer\d+@example\.com$/i }).lean();
  const customers = await TenantCustomer.find({ tenant: tenant?._id, user: { $in: users.map(item => item._id) } }).lean();
  const reviews = await Review.find({ tenant: tenant?._id, product: { $in: products.map(item => item._id) } }).lean();
  const orders = await Order.find({ tenant: tenant?._id, orderNumber: /^DEMO-/ }).lean();
  const invoices = await Invoice.find({ tenant: tenant?._id, order: { $in: orders.map(item => item._id) } }).lean();
  const attempts = await PaymentAttempt.find({ tenant: tenant?._id, order: { $in: orders.map(item => item._id) } }).lean();
  const shipments = await Shipment.find({ tenant: tenant?._id, order: { $in: orders.map(item => item._id) } }).lean();
  const userIds = new Set(users.map(item => String(item._id)));
  const productIds = new Set(products.map(item => String(item._id)));
  const categoryIds = new Set(categories.map(item => String(item._id)));
  const productChecks = {
    allHaveTenant: products.every(item => String(item.tenant) === String(tenant?._id)),
    allHaveCategory: products.every(item => categoryIds.has(String(item.category))),
    allHaveHtmlDescription: products.every(item => /<h2|<article/.test(item.description || '')),
    allHaveUnsplashImages: products.every(item => Array.isArray(item.images) && item.images.length >= 3 && item.images.every(media => String(media.url || '').startsWith('https://images.unsplash.com/'))),
    allHaveVariants: products.every(item => Array.isArray(item.variants) && item.variants.length >= 2 && item.variants.every(variant => variant.options?.length >= 2)),
    allHaveSpecsAndSeo: products.every(item => item.specifications?.length >= 3 && item.seo?.metaTitle),
  };
  const orderChecks = {
    allHaveUsers: orders.every(item => userIds.has(String(item.user))),
    allHaveProducts: orders.every(item => item.items?.length > 0 && item.items.every(line => productIds.has(String(line.product)))),
    allHaveTotals: orders.every(item => Number(item.total) > 0 && Number(item.subtotal) > 0),
    allHaveInvoices: orders.every(item => invoices.some(invoice => String(invoice.order) === String(item._id))),
  };
  const result = {
    success: Boolean(tenant) && categories.length === 14 && brands.length === 18 && products.length === 56 && users.length === 18 && customers.length === 18 && reviews.length === 168 && orders.length === 36 && invoices.length === 36 && productChecks.allHaveTenant && productChecks.allHaveCategory && productChecks.allHaveHtmlDescription && productChecks.allHaveUnsplashImages && productChecks.allHaveVariants && productChecks.allHaveSpecsAndSeo && orderChecks.allHaveUsers && orderChecks.allHaveProducts && orderChecks.allHaveTotals && orderChecks.allHaveInvoices,
    counts: { categories: categories.length, brands: brands.length, products: products.length, customers: customers.length, reviews: reviews.length, orders: orders.length, invoices: invoices.length, paymentAttempts: attempts.length, shipments: shipments.length },
    productChecks,
    orderChecks,
  };
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
  if (!result.success) process.exitCode = 1;
};

if (require.main === module) check().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { check };
