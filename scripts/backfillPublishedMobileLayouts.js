/*
 * Backfill the immutable published document/mobile snapshot introduced by the
 * Page Builder draft/public isolation change.
 *
 * Safe by default: without --apply this only reports candidates. Run it after
 * a verified database backup, then re-run with --apply to write snapshots.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Page = require('../models/Page');
const { publishedDocumentSnapshot } = require('../services/pageVersionService');

const apply = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  const filter = {
    publishedLayout: { $ne: null },
    $or: [{ publishedDocument: null }, { publishedDocument: { $exists: false } }],
  };
  const candidates = await Page.find(filter).select('_id slug publicSlug title publishedLayout publishedMobileLayout mobileLayout mobileLayoutMode seo pageSettings').lean();
  console.log(`[backfillPublishedMobileLayouts] candidates=${candidates.length} mode=${apply ? 'apply' : 'dry-run'}`);
  if (apply && candidates.length) {
    const operations = candidates.map(page => ({
      updateOne: {
        filter: { _id: page._id, $or: [{ publishedDocument: null }, { publishedDocument: { $exists: false } }] },
        update: { $set: { publishedMobileLayout: page.mobileLayout || null, publishedDocument: publishedDocumentSnapshot(page) } },
      },
    }));
    const result = await Page.bulkWrite(operations, { ordered: false });
    console.log(`[backfillPublishedMobileLayouts] modified=${result.modifiedCount || 0}`);
  } else {
    candidates.slice(0, 20).forEach(page => console.log(`- ${page.slug} (${page._id})`));
    if (!apply) console.log('[backfillPublishedMobileLayouts] no writes performed; use --apply only after backup review');
  }
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(`[backfillPublishedMobileLayouts] failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
