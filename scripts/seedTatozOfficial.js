require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { PLATFORM_NAME } = require('../constants/branding');

async function seed() {
  await connectDB();

  const User = require('../models/User');
  const Vendor = require('../models/Vendor');
  const Product = require('../models/Product');
  const Settings = require('../models/Settings');

  // Find the superadmin to be the owner of the platform's official vendor
  const adminUser = await User.findOne({ role: 'superadmin' });
  if (!adminUser) {
    console.error('No superadmin found. Run app first to auto-seed admin.');
    process.exit(1);
  }

  // Upsert vendor
  let vendor = await Vendor.findOne({ slug: 'tatoz-official' });
  if (!vendor) {
    vendor = await Vendor.create({
      owner: adminUser._id,
      storeName: `${PLATFORM_NAME} Official`,
      slug: 'tatoz-official',
      description: `Official ${PLATFORM_NAME} store — curated products with guaranteed quality.`,
      contactEmail: adminUser.email,
      contactPhone: adminUser.phone || '',
      status: 'active',
      approvedAt: new Date(),
      approvedBy: adminUser._id,
      stats: { totalProducts: 0, activeProducts: 0 },
    });
    console.log(`✅ Created vendor: ${PLATFORM_NAME} Official`);
  } else {
    console.log(`ℹ️  Vendor ${PLATFORM_NAME} Official already exists, skipping.`);
  }

  // Backfill existing products
  const productsWithoutVendor = await Product.countDocuments({
    $or: [{ vendor: { $exists: false } }, { vendor: null }],
  });
  if (productsWithoutVendor > 0) {
    const result = await Product.updateMany(
      { $or: [{ vendor: { $exists: false } }, { vendor: null }] },
      { $set: { vendor: vendor._id } }
    );
    console.log(`✅ Backfilled ${result.modifiedCount} products → ${PLATFORM_NAME} Official`);
  } else {
    console.log('ℹ️  No products need backfilling.');
  }

  // Update admin user's role to include vendor ref
  adminUser.vendor = vendor._id;
  await adminUser.save();
  console.log(`✅ Linked admin user to ${PLATFORM_NAME} Official vendor`);

  // Seed global commission setting
  await Settings.set('defaultCommissionRate', 10, 'marketplace');
  console.log('✅ Seeded defaultCommissionRate = 10%');

  console.log('🎉 Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
