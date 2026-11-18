// Preview by default. An exact page id is required; never replaces content
// or section order. Original documents are archived before the CAS write.
require('dotenv').config();
const mongoose = require('mongoose');
const { repairPageBuilderDefaults } = require('../utils/repairPageBuilderDefaults');

async function main() {
  const pageId = process.argv.find(arg => arg.startsWith('--page-id='))?.split('=')[1];
  if (!mongoose.isValidObjectId(pageId)) throw new Error('Supply an exact --page-id=<id>');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const db = mongoose.connection.db;
    const pages = db.collection('pages');
    const original = await pages.findOne({ _id: new mongoose.Types.ObjectId(pageId) });
    if (!original) throw new Error('Page not found');
    const repaired = JSON.parse(JSON.stringify(original));
    const changes = repairPageBuilderDefaults(repaired, {
      sharedLayout: process.argv.includes('--shared-layout'),
      platformFonts: process.argv.includes('--platform-fonts'),
    });
    if (apply && changes.length) {
      await db.collection('pagebuilderrepairbackups').insertOne({ pageId: original._id, savedAt: new Date(), reason: 'Null-default corruption repair', document: original });
      const fields = ['draftLayout', 'mobileLayout', 'publishedLayout', 'publishedMobileLayout', 'publishedDocument', 'pageSettings', 'mobileLayoutMode'];
      const patch = Object.fromEntries(fields.filter(key => key in repaired).map(key => [key, repaired[key]]));
      const saved = await pages.updateOne({ _id: original._id, builderRevision: original.builderRevision }, { $set: { ...patch, updatedAt: new Date() }, $inc: { builderRevision: 1 } });
      if (!saved.modifiedCount) throw new Error('Page changed during repair; rerun against the latest draft');
    }
    console.log(JSON.stringify({ pageId, dryRun: !apply, changes, revision: (original.builderRevision || 0) + (apply && changes.length ? 1 : 0) }, null, 2));
  } finally { await mongoose.disconnect(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
