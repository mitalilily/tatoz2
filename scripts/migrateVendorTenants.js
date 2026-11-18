require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Tenant = require('../models/Tenant');
const Vendor = require('../models/Vendor');

const relatedModels = [
  ['Product', require('../models/Product')],
  ['Page', require('../models/Page')],
  ['Payout', require('../models/Payout')],
  ['MarketplaceConnection', require('../models/MarketplaceConnection')],
  ['MarketplaceJob', require('../models/MarketplaceJob')],
  ['MarketplaceOrder', require('../models/MarketplaceOrder')],
  ['MarketplaceListing', require('../models/MarketplaceListing')],
  ['Review', require('../models/Review')],
  ['SubscriptionPlan', require('../models/SubscriptionPlan')],
];

const apply = process.argv.includes('--apply');
const explicitKey = String(process.argv.find(arg => arg.startsWith('--tenant='))?.split('=')[1] || process.env.DEFAULT_VENDOR_TENANT_KEY || '').trim().toLowerCase();

const orphanFilter = { $or: [{ tenant: { $exists: false } }, { tenant: null }] };

const resolveFallbackTenant = async () => {
  if (explicitKey) {
    const tenant = await Tenant.findOne({ $or: [{ key: explicitKey }, { slug: explicitKey }], status: { $ne: 'archived' } });
    if (!tenant) throw new Error(`Configured vendor fallback tenant was not found: ${explicitKey}`);
    return tenant;
  }
  const stores = await Tenant.countDocuments({ type: 'store', status: { $ne: 'archived' } });
  if (stores > 0) throw new Error('Multiple store tenants exist; rerun with --tenant=<key> so orphan sellers are not assigned ambiguously');
  const platform = await Tenant.findOne({ type: 'platform', status: { $ne: 'archived' } });
  if (!platform) throw new Error('No platform tenant exists for orphan seller migration');
  return platform;
};

const migrate = async () => {
  await connectDB();
  const tenant = await resolveFallbackTenant();
  const vendors = await Vendor.find(orphanFilter).select('_id storeName owner status').lean();
  const report = { mode: apply ? 'apply' : 'dry-run', targetTenant: { id: String(tenant._id), key: tenant.key }, orphanVendors: vendors.length, vendorNames: vendors.map(vendor => vendor.storeName), related: {} };
  const vendorIds = vendors.map(vendor => vendor._id);
  const Product = relatedModels[0][1];
  const productIds = await Product.find({ vendor: { $in: vendorIds } }).distinct('_id');
  for (const [name, Model] of relatedModels) {
    const filter = ['Review', 'SubscriptionPlan'].includes(name)
      ? { product: { $in: productIds }, ...orphanFilter }
      : { vendor: { $in: vendorIds }, ...orphanFilter };
    const count = await Model.countDocuments(filter);
    report.related[name] = count;
    if (apply && count) await Model.updateMany(filter, { $set: { tenant: tenant._id } });
  }
  if (apply && vendors.length) await Vendor.updateMany({ _id: { $in: vendorIds }, ...orphanFilter }, { $set: { tenant: tenant._id } });
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
};

if (require.main === module) migrate().catch(async error => { console.error(error.message); await mongoose.disconnect().catch(() => {}); process.exitCode = 1; });

module.exports = { migrate, orphanFilter, resolveFallbackTenant };
