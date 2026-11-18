const Settings = require('../models/Settings');
const { generateSEOContent } = require('../services/aiService');

const AUTO_SEO_COST = 50;

/**
 * Auto-generate SEO fields for a model document.
 * Fire-and-forget — does not throw or block the caller.
 *
 * @param {Model} Model - Mongoose model (Product, Category, Brand)
 * @param {string} docId - Document _id
 * @param {object} params - { title, description, category }
 */
async function autoGenerateSeo(Model, docId, { title, description, category }) {
  try {
    const credits = Number(await Settings.get('ai_credits', 0));
    if (credits < AUTO_SEO_COST) return; // silently skip

    await Settings.set('ai_credits', credits - AUTO_SEO_COST, 'ai');

    const seo = await generateSEOContent(
      title || '',
      (description || '').replace(/<[^>]+>/g, '').substring(0, 500),
      category || ''
    );

    const update = {};
    if (seo.metaTitle) update['seo.metaTitle'] = seo.metaTitle;
    if (seo.metaDescription) update['seo.metaDescription'] = seo.metaDescription;
    if (seo.keywords?.length) update['seo.keywords'] = seo.keywords;
    if (seo.altText) update['seo.altText'] = seo.altText;

    if (Object.keys(update).length > 0) {
      await Model.findByIdAndUpdate(docId, { $set: update });
    }
  } catch (err) {
    // Refund credits on failure
    try {
      const current = Number(await Settings.get('ai_credits', 0));
      await Settings.set('ai_credits', current + AUTO_SEO_COST, 'ai');
    } catch {}
    console.error('Auto SEO generation failed:', err.message);
  }
}

module.exports = { autoGenerateSeo };
