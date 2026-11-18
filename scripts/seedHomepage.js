const { v4: uuidv4 } = require('uuid');
const Page = require('../models/Page');
const Settings = require('../models/Settings');

const LEGACY_KEYS = {
  bannersHero: 'site_banners_hero',
  bannersGrid: 'site_banners_grid',
  bannersPromo: 'site_banners_promo',
  bannersWide: 'site_banners_wide',
};

async function legacyBanners() {
  const [hero, grid, promo, wide] = await Promise.all([
    Settings.get(LEGACY_KEYS.bannersHero, []),
    Settings.get(LEGACY_KEYS.bannersGrid, []),
    Settings.get(LEGACY_KEYS.bannersPromo, []),
    Settings.get(LEGACY_KEYS.bannersWide, []),
  ]);
  return {
    hero: Array.isArray(hero) ? hero : [],
    grid: Array.isArray(grid) ? grid : [],
    promo: Array.isArray(promo) ? promo : [],
    wide: Array.isArray(wide) ? wide : [],
  };
}

function buildDefaultLayout(legacy) {
  const sections = [];

  // Hero from legacy hero banners
  if (legacy.hero.length) {
    sections.push({
      id: uuidv4(),
      type: 'hero',
      data: {
        autoplay: true,
        intervalMs: 5000,
        slides: legacy.hero.map(b => ({
          imageUrl: b.imageUrl || '',
          headline: b.title || '',
          subheadline: b.subtitle || '',
          ctaLabel: b.cta || '',
          ctaLink: b.link || '',
          alignment: 'center',
          overlayOpacity: 0.4,
        })),
      },
      settings: { paddingY: 'none', backgroundColor: '', backgroundImage: '', fullWidth: true, visibility: 'all', schedule: { from: null, until: null } },
      responsiveOverrides: { mobile: {} },
    });
  }

  // A featured products row so a fresh homepage isn't bare
  sections.push({
    id: uuidv4(),
    type: 'productsShowcase',
    data: {
      heading: 'Featured products',
      source: 'collection',
      manualProductIds: [],
      collection: 'featured',
      collectionRef: null,
      layout: 'horizontalScroll',
      count: 12,
      seeAllLink: '/search?featured=1',
    },
    settings: { paddingY: 'lg', backgroundColor: '', backgroundImage: '', fullWidth: false, visibility: 'all', schedule: { from: null, until: null } },
    responsiveOverrides: { mobile: {} },
  });

  // Card grid from legacy grid+promo+wide banners
  const cards = [...legacy.grid, ...legacy.promo, ...legacy.wide].filter(b => b && b.imageUrl).map(b => ({
    imageUrl: b.imageUrl,
    heading: b.title || '',
    subtext: b.subtitle || '',
    link: b.link || '',
  }));
  if (cards.length) {
    sections.push({
      id: uuidv4(),
      type: 'cardGrid',
      data: { columns: 3, gap: 'md', cardStyle: 'overlay', heading: '', cards },
      settings: { paddingY: 'lg', backgroundColor: '', backgroundImage: '', fullWidth: false, visibility: 'all', schedule: { from: null, until: null } },
      responsiveOverrides: { mobile: {} },
    });
  }

  // Categories showcase (empty by default; admin will pick)
  sections.push({
    id: uuidv4(),
    type: 'categoriesShowcase',
    data: { heading: 'Shop by category', categoryIds: [], layout: 'circle' },
    settings: { paddingY: 'lg', backgroundColor: '', backgroundImage: '', fullWidth: false, visibility: 'all', schedule: { from: null, until: null } },
    responsiveOverrides: { mobile: {} },
  });

  return { sections };
}

async function seedHomepage() {
  const existing = await Page.findOne({ isHomepage: true });
  if (existing) {
    console.log('[seedHomepage] homepage already exists, skipping');
  } else {
    const legacy = await legacyBanners();
    const layout = buildDefaultLayout(legacy);
    await Page.create({
      slug: '/',
      title: 'Homepage',
      isHomepage: true,
      status: 'published',
      draftLayout: layout,
      publishedLayout: layout,
    });
    console.log('[seedHomepage] homepage created with', layout.sections.length, 'sections');
  }
  await seedChrome();
}

async function seedChrome() {
  // Header — empty by default. Admin opts in by adding sections (e.g. AnnouncementBar).
  if (!(await Page.findOne({ kind: 'header' }))) {
    await Page.create({
      slug: '__header',
      title: 'Site Header',
      kind: 'header',
      status: 'published',
      draftLayout: { sections: [] },
      publishedLayout: { sections: [] },
    });
    console.log('[seedHomepage] site header chrome created (empty)');
  }
  // Footer — empty by default.
  if (!(await Page.findOne({ kind: 'footer' }))) {
    await Page.create({
      slug: '__footer',
      title: 'Site Footer',
      kind: 'footer',
      status: 'published',
      draftLayout: { sections: [] },
      publishedLayout: { sections: [] },
    });
    console.log('[seedHomepage] site footer chrome created (empty)');
  }
}

module.exports = { seedHomepage };
