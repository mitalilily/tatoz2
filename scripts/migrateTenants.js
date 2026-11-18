require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Tenant = require('../models/Tenant');
const TenantMembership = require('../models/TenantMembership');
const Vendor = require('../models/Vendor');
const Integration = require('../models/Integration');
const IntegrationConnection = require('../models/IntegrationConnection');
const legacyIntegrationService = require('../services/integrationService');
const { PLATFORM_NAME } = require('../constants/branding');

const models = [
  ['Product', require('../models/Product')], ['Category', require('../models/Category')], ['Brand', require('../models/Brand')], ['Order', require('../models/Order')], ['Page', require('../models/Page')], ['Blog', require('../models/Blog')], ['BlogCategory', require('../models/BlogCategory')], ['Coupon', require('../models/Coupon')], ['ReferralCode', require('../models/ReferralCode')], ['ReferralTracking', require('../models/ReferralTracking')], ['Notification', require('../models/Notification')], ['Conversation', require('../models/Conversation')], ['ClickEvent', require('../models/ClickEvent')], ['AbandonedCart', require('../models/AbandonedCart')], ['MarketplaceConnection', require('../models/MarketplaceConnection')], ['MarketplaceJob', require('../models/MarketplaceJob')], ['MarketplaceOrder', require('../models/MarketplaceOrder')], ['MarketplaceListing', require('../models/MarketplaceListing')], ['PaymentAttempt', require('../models/PaymentAttempt')], ['Shipment', require('../models/Shipment')], ['AIUsage', require('../models/AIUsage')],
];

const dryRun = !process.argv.includes('--apply');
const backupDir = path.join(__dirname, '..', 'backups');

const normalizeHost = value => {
  const input = String(value || '').trim();
  if (!input) return '';
  try {
    return new URL(input.includes('://') ? input : `https://${input}`).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
};

const configuredPlatformDomains = () => Array.from(new Set([
  process.env.CLIENT_URL,
  ...String(process.env.PLATFORM_DOMAINS || '').split(','),
].map(normalizeHost).filter(Boolean)));

const applyPlatformDomains = async (platform, hosts = configuredPlatformDomains()) => {
  if (!hosts.length) return platform;
  const domains = (platform.domains || []).map(domain => ({
    host: domain.host,
    verified: Boolean(domain.verified),
    primary: false,
  }));
  hosts.forEach((host, index) => {
    const existing = domains.find(domain => domain.host === host);
    if (existing) {
      existing.verified = true;
      existing.primary = index === 0;
    } else {
      domains.push({ host, verified: true, primary: index === 0 });
    }
  });
  platform.domains = domains;
  await platform.save();
  return platform;
};

const countLegacy = async () => {
  const counts = { vendors: await Vendor.countDocuments({}), integrations: await Integration.countDocuments({}) };
  for (const [name, Model] of models) counts[name] = await Model.countDocuments({ tenant: { $exists: false } });
  return counts;
};

const createBackupManifest = async counts => {
  fs.mkdirSync(backupDir, { recursive: true });
  const filename = `tenant-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const target = path.join(backupDir, filename);
  fs.writeFileSync(target, JSON.stringify({ createdAt: new Date().toISOString(), database: mongoose.connection.name, counts, note: 'Logical pre-migration manifest. Use MongoDB Atlas/ mongodump backup for full restore.' }, null, 2));
  return target;
};

const applyMigration = async () => {
  const platform = await Tenant.findOneAndUpdate({ key: 'platform' }, { $setOnInsert: { key: 'platform', slug: 'platform', name: PLATFORM_NAME, type: 'platform', status: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await applyPlatformDomains(platform);
  const vendors = await Vendor.find({}).select('_id owner storeName slug tenant');
  for (const vendor of vendors) {
    const tenant = await Tenant.findOneAndUpdate({ migratedFromVendor: vendor._id }, { $setOnInsert: { key: `vendor-${vendor._id}`, slug: `vendor-${vendor.slug}`, name: vendor.storeName, type: 'store', status: vendor.status === 'suspended' ? 'suspended' : 'active', migratedFromVendor: vendor._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await Vendor.updateOne({ _id: vendor._id }, { $set: { tenant: tenant._id } });
    if (vendor.owner) await TenantMembership.updateOne({ tenant: tenant._id, user: vendor.owner }, { $set: { role: 'owner', status: 'active' } }, { upsert: true, setDefaultsOnInsert: true });
    await Promise.all([
      require('../models/Product').updateMany({ vendor: vendor._id, $or: [{ tenant: { $exists: false } }, { tenant: null }] }, { $set: { tenant: tenant._id } }),
      require('../models/Page').updateMany({ vendor: vendor._id, $or: [{ tenant: { $exists: false } }, { tenant: null }] }, { $set: { tenant: tenant._id } }),
    ]);
  }
  for (const [, Model] of models) await Model.updateMany({ $or: [{ tenant: { $exists: false } }, { tenant: null }] }, { $set: { tenant: platform._id } });
  const legacy = await Integration.find({}).select('+credentialsEncrypted').lean();
  for (const record of legacy) {
    const exists = await IntegrationConnection.findOne({ tenant: platform._id, provider: record.provider, accountKey: 'default' });
    if (!exists) await IntegrationConnection.create({ tenant: platform._id, provider: record.provider.toLowerCase(), accountKey: 'default', enabled: record.enabled, status: record.lastTest?.status === 'connected' ? 'connected' : 'untested', credentialsEncrypted: record.credentialsEncrypted, credentialVersion: String(record.credentialsEncrypted || '').startsWith('v2.') ? 2 : 1, lastTest: record.lastTest, updatedBy: record.updatedBy });
  }
  return { platform: platform._id, vendors: vendors.length, legacyIntegrations: legacy.length };
};

const main = async () => {
  await connectDB();
  const counts = await countLegacy();
  const manifest = await createBackupManifest(counts);
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', counts, manifest }, null, 2));
  if (!dryRun) console.log(JSON.stringify({ migrated: await applyMigration() }, null, 2));
  await mongoose.disconnect();
};

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { countLegacy, createBackupManifest, applyMigration, configuredPlatformDomains, applyPlatformDomains, normalizeHost };
