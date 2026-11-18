const Page = require('../models/Page');
const { createPageVersion, publishPageDocument } = require('./pageVersionService');
const { withLock } = require('./distributedLock');

let intervalRef = null;

async function tick() {
  return withLock('scheduler:page-publish', 5 * 60 * 1000, async () => {
    const now = new Date();
    const due = await Page.find({ scheduledPublishAt: { $ne: null, $lte: now } }).limit(20);
    for (const page of due) {
      try {
        if (page.publishedLayout) {
          await createPageVersion(page, { publishedAt: page.updatedAt, userId: page.updatedBy, changeNote: 'Auto-snapshot before scheduled publish' });
        }
        publishPageDocument(page);
        page.publishedMobileLayout = page.mobileLayoutMode === 'separate' ? page.mobileLayout : null;
        page.status = 'published';
        page.scheduledPublishAt = null;
        await page.save();
        console.log(`[pageScheduler] Published page ${page.slug}`);
      } catch (err) {
        console.error(`[pageScheduler] Failed to publish ${page.slug}:`, err.message);
      }
    }
  });
}

function start({ intervalMs = 60000 } = {}) {
  if (intervalRef) return;
  intervalRef = setInterval(() => { tick().catch(err => console.error('[pageScheduler]', err)); }, intervalMs);
  console.log(`[pageScheduler] started (every ${intervalMs}ms)`);
}

function stop() {
  if (intervalRef) clearInterval(intervalRef);
  intervalRef = null;
}

module.exports = { start, stop, tick };
