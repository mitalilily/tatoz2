/**
 * Publish the curated Tatoz storefront homepage.
 *
 * This is intentionally data-driven: every visual block remains an ordinary
 * Page Builder section, so an admin can keep editing the page after the
 * initial art direction has been applied.
 *
 * Run with the production environment loaded, for example:
 *   node scripts/seedBeautifulStorefront.js
 */
const mongoose = require('mongoose');
const Page = require('../models/Page');
const Category = require('../models/Category');
const { createPageVersion, publishPageDocument } = require('../services/pageVersionService');

const asset = name => `/uploads/${name}`;

const ASSETS = {
  heroFire: asset('1789081975386-317727adde6e24a2.png'),
  heroSummer: asset('1789081987304-a663612620da34e0.png'),
  heroHighlight: asset('1789081994893-168655e97e64c976.png'),
  heroSale: asset('1789082018875-4b007937d81cc54e.png'),
  portraitRed: asset('1789082261096-8031a9ee276068ec.png'),
  bannerWicked: asset('1789082280809-e362bf1997220d56.png'),
  bannerFire: asset('1789082289768-f4b99739c428ff87.png'),
  portraitNeon: asset('1789082521786-529d9ddc3360ecd4.png'),
  bannerCute: asset('1789082558534-632f271f0de63403.png'),
  bannerGold: asset('1789082573639-86be10d3c66cb781.png'),
};

const CATEGORY_SLUGS = [
  'demo-fashion',
  'demo-footwear',
  'demo-electronics',
  'demo-beauty',
  'demo-home',
  'demo-bags',
  'demo-sports',
  'demo-health',
];

const EMPTY_MEDIA = {
  width: null,
  height: null,
  maxWidth: null,
  maxHeight: null,
  aspectRatio: 'auto',
  objectFit: null,
  objectPosition: null,
  align: 'center',
  borderRadius: null,
  opacity: null,
};

function settings(overrides = {}) {
  return {
    variant: 'default',
    padding: { all: 0 },
    margin: { all: 0 },
    paddingY: 'none',
    backgroundColor: '',
    backgroundToken: 'none',
    textToken: 'text',
    backgroundImage: '',
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    fullWidth: false,
    sectionAlign: 'center',
    width: null,
    height: null,
    minHeight: null,
    overflow: 'visible',
    zIndex: null,
    maxWidth: null,
    textAlign: 'left',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: '',
    borderColorToken: 'border',
    borderRadius: 0,
    borderRadiusToken: 'none',
    boxShadow: 'none',
    typography: {
      fontFamily: 'inherit',
      fontSize: null,
      lineHeight: null,
      letterSpacing: null,
      fontWeight: null,
    },
    anchorId: '',
    customClass: '',
    aiAssetAttributions: [],
    media: { ...EMPTY_MEDIA },
    visibility: 'all',
    schedule: { from: null, until: null },
    ...overrides,
  };
}

function responsive() {
  return { tablet: {}, mobile: {}, tabletSettings: {}, mobileSettings: {} };
}

function section(id, type, data, sectionSettings = {}) {
  return {
    id,
    type,
    data,
    settings: settings(sectionSettings),
    responsiveOverrides: responsive(),
  };
}

function heroSlides({ mobile = false } = {}) {
  if (mobile) {
    return [
      { imageUrl: ASSETS.heroSummer, headline: '', subheadline: '', ctaLabel: '', ctaLink: '', alignment: 'left', overlayOpacity: 0.02, bgColor: '', textColor: '', imagePosition: 'left' },
      { imageUrl: ASSETS.heroSale, headline: '', subheadline: '', ctaLabel: '', ctaLink: '', alignment: 'left', overlayOpacity: 0.02, bgColor: '', textColor: '', imagePosition: 'left' },
      { imageUrl: ASSETS.heroHighlight, headline: '', subheadline: '', ctaLabel: '', ctaLink: '', alignment: 'right', overlayOpacity: 0.02, bgColor: '', textColor: '', imagePosition: 'left' },
    ];
  }
  return [
    { imageUrl: ASSETS.heroFire, headline: '', subheadline: '', ctaLabel: '', ctaLink: '', alignment: 'left', overlayOpacity: 0.02, bgColor: '', textColor: '', imagePosition: 'left' },
    { imageUrl: ASSETS.heroSummer, headline: '', subheadline: '', ctaLabel: '', ctaLink: '', alignment: 'left', overlayOpacity: 0.02, bgColor: '', textColor: '', imagePosition: 'left' },
    { imageUrl: ASSETS.heroHighlight, headline: '', subheadline: '', ctaLabel: '', ctaLink: '', alignment: 'right', overlayOpacity: 0.02, bgColor: '', textColor: '', imagePosition: 'left' },
    { imageUrl: ASSETS.heroSale, headline: '', subheadline: '', ctaLabel: '', ctaLink: '', alignment: 'left', overlayOpacity: 0.02, bgColor: '', textColor: '', imagePosition: 'left' },
  ];
}

function desktopLayout(categoryIds) {
  return {
    sections: [
      section('storefront-announcement', 'announcementBar', {
        text: 'New season, better finds — free shipping over ₹999',
        linkLabel: 'Shop now',
        linkUrl: '/search',
        backgroundColor: '#111111',
        textColor: '#ffffff',
        dismissible: false,
      }, { fullWidth: true, textToken: 'inverse' }),

      section('storefront-hero', 'hero', {
        variant: 'classic',
        aspectRatio: '2.15/1',
        customHeight: { value: 60, unit: 'vh' },
        transition: 'fade',
        showArrows: true,
        showDots: true,
        autoplay: true,
        intervalMs: 5500,
        slides: heroSlides(),
      }, { fullWidth: true, padding: { all: 0 }, anchorId: 'top' }),

      section('storefront-benefits', 'uspRow', {
        columns: 4,
        items: [
          { icon: 'sparkles', heading: 'Curated finds', subtext: 'A sharper edit for every day' },
          { icon: 'truck', heading: 'Fast delivery', subtext: 'Reliable shipping across India' },
          { icon: 'shield', heading: 'Secure checkout', subtext: 'Trusted payments, protected data' },
          { icon: 'rotate', heading: 'Easy returns', subtext: 'Simple support when you need it' },
        ],
      }, { padding: { all: 28 }, backgroundColor: '#fffdf9', borderWidth: 1, borderColor: '#f1ebe2', borderRadius: 0 }),

      section('storefront-categories', 'categoriesShowcase', {
        heading: 'Shop by world',
        categoryIds,
        layout: 'square',
      }, { padding: { all: 0 }, paddingY: 'xl', variant: 'editorial', anchorId: 'categories' }),

      section('storefront-featured', 'productsShowcase', {
        heading: "This week's edit",
        source: 'collection',
        manualProductIds: [],
        collection: 'featured',
        collectionRef: null,
        layout: 'grid',
        cardVariant: 'editorial',
        count: 8,
        seeAllLink: '/search?featured=1',
      }, { padding: { all: 0 }, paddingY: 'xl', variant: 'editorial', backgroundColor: '#fff8f1', anchorId: 'featured' }),

      section('storefront-campaign', 'mosaic', {
        preset: 'L',
        heading: '',
        tiles: [
          { imageUrl: ASSETS.portraitRed, heading: '', link: '/search' },
          { imageUrl: ASSETS.bannerWicked, heading: '', link: '/search' },
          { imageUrl: ASSETS.bannerCute, heading: '', link: '/search' },
        ],
      }, { padding: { all: 0 }, paddingY: 'xl', backgroundColor: '#111111', textToken: 'inverse', anchorId: 'campaign' }),

      section('storefront-promo', 'imageBanner', {
        imageUrl: ASSETS.bannerGold,
        link: '/search',
        altText: 'The gold edit — explore current offers',
        fullBleed: false,
        aspectRatio: 'banner',
      }, { padding: { all: 0 }, paddingY: 'xl', backgroundColor: '#fff8f1' }),

      section('storefront-new-arrivals', 'productsShowcase', {
        heading: 'Just landed',
        source: 'collection',
        manualProductIds: [],
        collection: 'newest',
        collectionRef: null,
        layout: 'grid',
        cardVariant: 'minimal',
        count: 8,
        seeAllLink: '/search',
      }, { padding: { all: 0 }, paddingY: 'xl', variant: 'editorial', anchorId: 'new-arrivals' }),

      section('storefront-shop-all', 'buttons', {
        align: 'center',
        heading: 'Find your next favourite',
        buttons: [
          { label: 'Shop all products', link: '/search', style: 'solid', size: 'lg' },
          { label: 'Browse categories', link: '#categories', style: 'outline', size: 'lg' },
        ],
      }, { padding: { all: 0 }, paddingY: 'lg', backgroundColor: '#fffdf9', textAlign: 'center' }),

      section('storefront-newsletter', 'newsletter', {
        heading: 'Stay in the loop',
        subheading: 'Fresh drops, thoughtful edits and offers worth opening — straight to your inbox.',
        placeholder: 'Your email address',
        buttonLabel: 'Join the list',
        successMessage: "You're on the list — see you in the next drop.",
        style: 'wide',
      }, { padding: { all: 0 }, paddingY: 'xl', backgroundColor: '#fffdf9' }),

      section('storefront-back-to-top', 'backToTop', {}, { fullWidth: true }),
    ],
  };
}

function mobileLayout(categoryIds) {
  return {
    sections: [
      section('storefront-mobile-announcement', 'announcementBar', {
        text: 'Free shipping over ₹999 · Easy returns',
        linkLabel: 'Shop now',
        linkUrl: '/search',
        backgroundColor: '#111111',
        textColor: '#ffffff',
        dismissible: false,
      }, { fullWidth: true, textToken: 'inverse' }),

      section('storefront-mobile-hero', 'hero', {
        variant: 'classic',
        aspectRatio: '2.15/1',
        customHeight: { value: 60, unit: 'vh' },
        transition: 'slide',
        showArrows: false,
        showDots: true,
        autoplay: true,
        intervalMs: 5000,
        slides: heroSlides({ mobile: true }),
      }, { fullWidth: true, padding: { all: 0 }, anchorId: 'top' }),

      section('storefront-mobile-benefits', 'uspRow', {
        columns: 2,
        items: [
          { icon: 'sparkles', heading: 'Curated finds', subtext: 'Made to be discovered' },
          { icon: 'truck', heading: 'Fast delivery', subtext: 'Across India' },
          { icon: 'shield', heading: 'Secure checkout', subtext: 'Protected payments' },
          { icon: 'rotate', heading: 'Easy returns', subtext: 'Simple support' },
        ],
      }, { padding: { all: 20 }, backgroundColor: '#fffdf9', borderWidth: 1, borderColor: '#f1ebe2' }),

      section('storefront-mobile-categories', 'categoriesShowcase', {
        heading: 'Shop by world',
        categoryIds,
        layout: 'square',
      }, { padding: { all: 0 }, paddingY: 'lg', variant: 'editorial', anchorId: 'categories' }),

      section('storefront-mobile-featured', 'productsShowcase', {
        heading: "This week's edit",
        source: 'collection',
        manualProductIds: [],
        collection: 'featured',
        collectionRef: null,
        layout: 'grid',
        cardVariant: 'editorial',
        count: 6,
        seeAllLink: '/search?featured=1',
      }, { padding: { all: 0 }, paddingY: 'lg', variant: 'editorial', backgroundColor: '#fff8f1', anchorId: 'featured' }),

      section('storefront-mobile-campaign', 'mosaic', {
        preset: '1+2',
        heading: '',
        tiles: [
          { imageUrl: ASSETS.portraitNeon, heading: '', link: '/search' },
          { imageUrl: ASSETS.bannerGold, heading: '', link: '/search' },
          { imageUrl: ASSETS.bannerFire, heading: '', link: '/search' },
        ],
      }, { padding: { all: 0 }, paddingY: 'lg', backgroundColor: '#111111', textToken: 'inverse' }),

      section('storefront-mobile-new-arrivals', 'productsShowcase', {
        heading: 'Just landed',
        source: 'collection',
        manualProductIds: [],
        collection: 'newest',
        collectionRef: null,
        layout: 'grid',
        cardVariant: 'minimal',
        count: 6,
        seeAllLink: '/search',
      }, { padding: { all: 0 }, paddingY: 'lg', variant: 'editorial', anchorId: 'new-arrivals' }),

      section('storefront-mobile-shop-all', 'buttons', {
        align: 'center',
        heading: 'Find your next favourite',
        buttons: [
          { label: 'Shop all products', link: '/search', style: 'solid', size: 'md' },
          { label: 'Browse categories', link: '#categories', style: 'outline', size: 'md' },
        ],
      }, { padding: { all: 0 }, paddingY: 'lg', backgroundColor: '#fffdf9', textAlign: 'center' }),

      section('storefront-mobile-newsletter', 'newsletter', {
        heading: 'Stay in the loop',
        subheading: 'Fresh drops and offers, occasionally.',
        placeholder: 'Your email address',
        buttonLabel: 'Join the list',
        successMessage: "You're on the list — see you in the next drop.",
        style: 'wide',
      }, { padding: { all: 0 }, paddingY: 'lg', backgroundColor: '#fffdf9' }),

      section('storefront-mobile-back-to-top', 'backToTop', {}, { fullWidth: true }),
    ],
  };
}

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);

  const categories = await Category.find({
    isActive: true,
    slug: { $in: CATEGORY_SLUGS },
  }).select('_id slug').lean();
  const bySlug = new Map(categories.map(item => [item.slug, String(item._id)]));
  const categoryIds = CATEGORY_SLUGS.map(slug => bySlug.get(slug)).filter(Boolean);

  const page = await Page.findOne({ isHomepage: true, vendor: null }).sort({ updatedAt: -1 });
  if (!page) throw new Error('Homepage page not found');

  if (page.publishedLayout) {
    await createPageVersion(page, {
      publishedAt: page.updatedAt,
      userId: page.updatedBy,
      changeNote: 'Before curated storefront refresh',
    });
  }

  const layout = desktopLayout(categoryIds);
  const mobile = mobileLayout(categoryIds);
  page.title = 'Tatoz — The Everyday Edit';
  page.draftLayout = layout;
  page.mobileLayout = mobile;
  page.mobileLayoutMode = 'separate';
  page.pageSettings = {
    showHeader: true,
    showFooter: true,
    backgroundColor: '#fffdf9',
    designSystem: {
      primaryColor: '#f97316',
      accentColor: '#111111',
      textColor: '#171717',
      mutedTextColor: '#737373',
      surfaceColor: '#fffdf9',
      borderColor: '#eee7df',
      headingFont: 'serif',
      bodyFont: 'system',
      baseRadius: 16,
      contentWidth: 1280,
    },
  };
  page.seo = {
    metaTitle: 'Tatoz — The Everyday Edit',
    metaDescription: 'Discover a sharper edit of fashion, lifestyle, beauty, tech and everyday finds on Tatoz.',
    ogImage: ASSETS.heroSummer,
    canonical: 'https://tatoz.com',
    robots: 'index, follow',
  };
  page.builderRevision = (page.builderRevision || 0) + 1;
  publishPageDocument(page);
  page.status = 'published';
  page.scheduledPublishAt = null;
  await page.save();

  console.log(JSON.stringify({
    success: true,
    pageId: String(page._id),
    desktopSections: layout.sections.length,
    mobileSections: mobile.sections.length,
    categories: categoryIds.length,
    builderRevision: page.builderRevision,
  }));
}

run()
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
