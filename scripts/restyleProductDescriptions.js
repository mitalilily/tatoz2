/**
 * Restyle all product descriptions into self-contained stylish HTML.
 *
 * Each description is rebuilt from that product's own data
 * (title, brand, category, tags, specifications, variants, shortDescription)
 * so every category keeps correct, product-specific content.
 *
 * The product page renders `description` inside a sandboxed iframe
 * (see DescriptionFrame in client/src/pages/customer/ProductDetailPage.jsx),
 * so the scoped <style> block below is applied as-is. No external
 * fonts, images or scripts are used — fully offline-safe.
 *
 * Usage:
 *   node scripts/restyleProductDescriptions.js [--dry-run] [--limit N]
 *   node scripts/restyleProductDescriptions.js --restore backups/<file>.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

require('../models/Category');
const Product = require('../models/Product');
const Category = require('../models/Category');

// Gradient accent per category slug (hue pairs). Unknown slugs fall back.
const CATEGORY_HUES = {
  apparel: [262, 318],
  footwear: [22, 348],
  electronics: [217, 262],
  'home-kitchen': [152, 84],
  beauty: [325, 265],
  accessories: [266, 200],
  'bags-backpacks': [36, 12],
  watches: [45, 30],
  'sports-outdoors': [160, 210],
  books: [28, 48],
  'toys-games': [0, 35],
  jewelry: [42, 320],
  'health-personal-care': [170, 140],
  'pet-supplies': [95, 45],
  'office-supplies': [205, 185],
};
const DEFAULT_HUES = [230, 280];

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function categoryHues(slug) {
  return CATEGORY_HUES[slug] || DEFAULT_HUES;
}

/**
 * Build a stylish, self-contained HTML description for one product.
 * @param {object} product lean product object (specifications, variants, tags, ...)
 * @param {string} categoryName resolved category display name
 * @returns {string} HTML string for Product.description
 */
function buildStylishDescription(product, categoryName) {
  const title = product.title || 'Product';
  const brand = product.brand || '';
  const category = categoryName || 'General';
  const slug = (product.categorySlug || 'general').toLowerCase();
  const [h1, h2] = categoryHues(slug);
  const tagline =
    product.shortDescription ||
    `${title} by ${brand || 'our store'}. Quality checked and shipped fast across India.`;
  const tags = (product.tags || []).filter(Boolean).slice(0, 4);
  const specs = (product.specifications || []).filter((s) => s && (s.key || s.value));
  const variants = (product.variants || []).filter((v) => v && v.name && (v.options || []).length);

  const t = escapeHtml(title);
  const b = escapeHtml(brand);
  const c = escapeHtml(category);
  const tag = escapeHtml(tagline);

  const chips = [
    ...tags.map((x) => `<span class="pdesc-chip">${escapeHtml(x)}</span>`),
    ...variants.slice(0, 2).map((v) => `<span class="pdesc-chip pdesc-chip-alt">${escapeHtml(v.options.length)} ${escapeHtml(v.name)} options</span>`),
  ].join('');

  const highlights = specs.slice(0, 5).map((s) => {
    const k = escapeHtml(s.key || 'Detail');
    const v = escapeHtml(s.value || '');
    return `<li><span class="pdesc-tick">✓</span><div><strong>${k}:</strong> ${v}</div></li>`;
  }).join('');

  const specRows = specs.map((s, i) =>
    `<tr class="${i % 2 ? 'pdesc-odd' : 'pdesc-even'}"><th>${escapeHtml(s.key || 'Detail')}</th><td>${escapeHtml(s.value || '—')}</td></tr>`
  ).join('');

  const optionBlocks = variants.slice(0, 3).map((v) => {
    const pills = (v.options || []).slice(0, 12).map((o) =>
      `<span class="pdesc-pill">${escapeHtml(o.value || '')}</span>`
    ).join('');
    return `<div class="pdesc-opt"><span class="pdesc-opt-name">${escapeHtml(v.name)}</span><div class="pdesc-pills">${pills}</div></div>`;
  }).join('');

  return `<style>
.pdesc{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.65;margin:0 auto;max-width:860px}
.pdesc-hero{border-radius:18px;padding:30px 28px;color:#fff;background:linear-gradient(120deg,hsl(${h1},72%,46%),hsl(${h2},78%,42%));position:relative;overflow:hidden}
.pdesc-hero:after{content:"";position:absolute;right:-70px;top:-70px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.14)}
.pdesc-hero:before{content:"";position:absolute;right:40px;bottom:-90px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.10)}
.pdesc-eyebrow{display:inline-block;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);padding:5px 12px;border-radius:999px;margin-bottom:12px}
.pdesc-title{margin:0 0 8px;font-size:26px;line-height:1.25;font-weight:800}
.pdesc-tag{margin:0 0 14px;font-size:14.5px;opacity:.94;max-width:60ch}
.pdesc-chips{display:flex;flex-wrap:wrap;gap:8px;position:relative;z-index:1}
.pdesc-chip{font-size:12px;font-weight:600;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);padding:4px 12px;border-radius:999px}
.pdesc-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
@media(max-width:640px){.pdesc-grid{grid-template-columns:1fr}}
.pdesc-card{background:#fff;border:1px solid #e6e9f2;border-radius:16px;padding:20px 20px 14px;box-shadow:0 6px 18px rgba(15,23,42,.06)}
.pdesc-card h3{margin:0 0 12px;font-size:15px;font-weight:800;letter-spacing:.2px;color:#0f172a;display:flex;align-items:center;gap:8px}
.pdesc-card h3 .pdesc-ico{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;color:#fff;font-size:14px;background:linear-gradient(135deg,hsl(${h1},72%,50%),hsl(${h2},78%,46%))}
.pdesc-points{list-style:none;margin:0;padding:0}
.pdesc-points li{display:flex;gap:10px;padding:8px 0;border-top:1px dashed #edf0f7;font-size:13.5px}
.pdesc-points li:first-child{border-top:none}
.pdesc-tick{flex:none;width:22px;height:22px;border-radius:50%;background:hsl(${h1},80%,94%);color:hsl(${h1},75%,38%);font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center;margin-top:2px}
.pdesc table{width:100%;border-collapse:collapse;font-size:13.5px}
.pdesc th{text-align:left;padding:8px 10px;color:#0f172a;width:42%;font-weight:700}
.pdesc td{padding:8px 10px;color:#475569}
.pdesc-even{background:hsl(${h1},60%,97%)}
.pdesc-odd{background:#fff}
.pdesc tr{border-bottom:1px solid #eef1f7}
.pdesc-opt{margin-top:14px;background:#fff;border:1px solid #e6e9f2;border-radius:16px;padding:16px 20px}
.pdesc-opt-name{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:hsl(${h1},70%,38%)}
.pdesc-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.pdesc-pill{font-size:13px;font-weight:600;border:1.5px solid hsl(${h1},55%,82%);color:hsl(${h1},70%,32%);background:hsl(${h1},70%,97%);padding:5px 14px;border-radius:999px}
.pdesc-strip{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;background:#0f172a;color:#e2e8f0;border-radius:16px;padding:16px 20px;font-size:13px}
.pdesc-strip div{flex:1 1 160px;display:flex;gap:9px;align-items:flex-start}
.pdesc-strip strong{display:block;color:#fff;font-size:13px}
.pdesc-strip span{opacity:.75;font-size:12px}
.pdesc-sico{flex:none;width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-size:15px;background:rgba(255,255,255,.12)}
</style>
<div class="pdesc">
<div class="pdesc-hero"><span class="pdesc-eyebrow">${b}${b ? ' &nbsp;•&nbsp; ' : ''}${c}</span><h2 class="pdesc-title">${t}</h2><p class="pdesc-tag">${tag}</p><div class="pdesc-chips">${chips}</div></div>
<div class="pdesc-grid"><div class="pdesc-card"><h3><span class="pdesc-ico">★</span>Why you&#39;ll love it</h3><ul class="pdesc-points">${highlights || '<li>No highlights listed.</li>'}</ul></div><div class="pdesc-card"><h3><span class="pdesc-ico">≡</span>Specifications</h3><table>${specRows || '<tr><td>Details coming soon.</td></tr>'}</table></div></div>
${optionBlocks ? `<div class="pdesc-opt"><span class="pdesc-opt-name">Available options</span>${optionBlocks}</div>` : ''}
<div class="pdesc-strip"><div><span class="pdesc-sico">✓</span><div><strong>Quality checked</strong><span>Inspected before dispatch from our India warehouse.</span></div></div><div><span class="pdesc-sico">▸</span><div><strong>Fast shipping</strong><span>Packed in 24–48 hrs with live order tracking.</span></div></div><div><span class="pdesc-sico">↩</span><div><strong>Easy returns</strong><span>Hassle-free returns as per store policy at checkout.</span></div></div></div>
</div>`;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dryRun = args.includes('--dry-run');
  const limit = get('--limit') ? parseInt(get('--limit'), 10) : 0;

  if (get('--restore')) {
    const file = path.resolve(get('--restore'));
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    await mongoose.connect(process.env.MONGO_URI);
    let n = 0;
    for (const r of rows) {
      await Product.updateOne({ _id: r._id }, { $set: { description: r.description } });
      n += 1;
    }
    console.log(`Restored ${n} descriptions from ${file}`);
    await mongoose.disconnect();
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);
  const categories = await Category.find().select('name slug').lean();
  const catById = new Map(categories.map((c) => [String(c._id), c]));

  const query = Product.find().populate('category', 'name slug');
  if (limit) query.limit(limit);
  const products = await query.lean();
  console.log(`Found ${products.length} products${dryRun ? ' (dry run)' : ''}`);

  const backup = [];
  let updated = 0;
  let beforeLen = 0;
  let afterLen = 0;

  for (const p of products) {
    const cat = p.category && p.category.name
      ? p.category
      : catById.get(String(p.category)) || { name: 'General', slug: 'general' };
    const html = buildStylishDescription(
      { ...p, categorySlug: cat.slug || 'general' },
      cat.name || 'General'
    );
    backup.push({ _id: String(p._id), title: p.title, description: p.description });
    beforeLen += (p.description || '').length;
    afterLen += html.length;
    if (!dryRun) {
      await Product.updateOne({ _id: p._id }, { $set: { description: html } });
      updated += 1;
      if (updated % 20 === 0) console.log(`... ${updated} updated`);
    }
  }

  if (!dryRun) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.resolve(`backups/product-descriptions-${stamp}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(backup, null, 1));
    console.log(`Backup written: ${file}`);
    console.log(`Updated ${updated}/${products.length} products.`);
  }
  console.log(`Avg description length: before ${Math.round(beforeLen / products.length)} → after ${Math.round(afterLen / products.length)} chars`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { buildStylishDescription, escapeHtml, categoryHues };
