/*
 * Repair the concrete data defects documented in Unique_Dashboard_Bugs_Report.pdf.
 *
 * Dry-run by default. Use `MONGO_URI=... node scripts/repairUniqueDashboardData.js
 * --apply` only after taking the normal database backup. The script is
 * tenant-aware and idempotent so an already-correct record is left unchanged.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Bundle = require('../models/Bundle');

const apply = process.argv.includes('--apply');
const dummyBrandPattern = /^sdssd$/i;
const legacyWatchPattern = /^generic smartwatch(?:\s+—\s+demo edition)?$/i;
const healthyBowlPattern = /^healthy bowl set(?:\s+—\s+demo edition)?$/i;

const tenantQuery = tenant => tenant ? { tenant } : { $or: [{ tenant: { $exists: false } }, { tenant: null }] };
const categoryFor = async (product, names) => Category.findOne({
  ...tenantQuery(product.tenant),
  name: { $in: names },
}).select('_id image name').lean();

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    smartwatchCategoryRepairs: 0,
    healthyBowlImageRepairs: 0,
    categoryCopyRepairs: 0,
    bundleCopyRepairs: 0,
    dummyBrandsPurged: 0,
  };

  const smartwatchProducts = await Product.find({ title: { $regex: legacyWatchPattern } }).select('_id title tenant category').lean();
  for (const product of smartwatchProducts) {
    const category = await categoryFor(product, ['Watches & Wearables', 'Electronics & Gadgets']);
    if (!category || String(product.category) === String(category._id)) continue;
    summary.smartwatchCategoryRepairs += 1;
    if (apply) await Product.updateOne({ _id: product._id }, { $set: { category: category._id } });
  }

  const bowlProducts = await Product.find({ title: { $regex: healthyBowlPattern } }).select('_id title tenant thumbnail images').lean();
  for (const product of bowlProducts) {
    const category = await categoryFor(product, ['Pet Supplies']);
    if (!category?.image) continue;
    const images = Array.isArray(product.images) ? [...product.images] : [];
    const currentPrimary = product.thumbnail || images[0]?.url || '';
    if (currentPrimary === category.image && images[0]?.url === category.image) continue;
    summary.healthyBowlImageRepairs += 1;
    const primary = { url: category.image, alt: 'Healthy Bowl Set product view 1' };
    const nextImages = images.length ? [{ ...images[0], ...primary }, ...images.slice(1)] : [primary];
    if (apply) await Product.updateOne({ _id: product._id }, { $set: { thumbnail: category.image, images: nextImages } });
  }

  const categoryCopy = await Category.find({ description: { $regex: /\bedit\b/i } }).select('_id description').lean();
  summary.categoryCopyRepairs = categoryCopy.length;
  if (apply) {
    for (const category of categoryCopy) {
      await Category.updateOne({ _id: category._id }, { $set: { description: category.description.replace(/\bedit\b/gi, 'collection') } });
    }
  }

  const bundleCopy = await Bundle.find({ shortDescription: { $regex: /\ba\s+\d+(?:\.\d+)?%\s+(?:demo\s+)?bundle\s+saving\b/i } }).select('_id shortDescription').lean();
  summary.bundleCopyRepairs = bundleCopy.length;
  if (apply) {
    for (const bundle of bundleCopy) {
      const shortDescription = bundle.shortDescription
        .replace(/\ba\s+(\d+(?:\.\d+)?)%\s+(?:demo\s+)?bundle\s+saving\b/gi, '$1% bundle savings')
        .replace(/\bbundle\s+saving\b/gi, 'bundle savings');
      await Bundle.updateOne({ _id: bundle._id }, { $set: { shortDescription } });
    }
  }

  const dummyBrands = await Brand.find({ name: { $regex: dummyBrandPattern } }).select('_id name').lean();
  if (dummyBrands.length) {
    const ids = dummyBrands.map(brand => brand._id);
    const productsUsingDummy = await Product.countDocuments({ brand: { $regex: dummyBrandPattern } });
    if (apply && productsUsingDummy) await Product.updateMany({ brand: { $regex: dummyBrandPattern } }, { $set: { brand: '' } });
    if (apply) await Brand.deleteMany({ _id: { $in: ids } });
    summary.dummyBrandsPurged = dummyBrands.length;
    summary.dummyBrandProductReferencesCleared = productsUsingDummy;
  }

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
  return summary;
};

if (require.main === module) run().catch(async error => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});

module.exports = { run, tenantQuery, legacyWatchPattern, healthyBowlPattern };
