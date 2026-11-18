require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const slugify = require('slugify');
const { v4: uuid } = require('uuid');

const Settings = require('../models/Settings');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Page = require('../models/Page');
const Vendor = require('../models/Vendor');
const Coupon = require('../models/Coupon');
const Review = require('../models/Review');
const Blog = require('../models/Blog');
const BlogCategory = require('../models/BlogCategory');
const LegalPage = require('../models/LegalPage');
const User = require('../models/User');
const { PLATFORM_NAME } = require('../constants/branding');

const HOME = process.env.HOME || '/home/nextyoulabs';
const DAY = 86400000;
const NOW = Date.now();
const USED_HASHES = new Set();
let LOCK = 70000;

const avatar = (name, color = '0f172a') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${color.replace('#', '')}&color=fff&size=256&bold=true`;
const slug = (value) => slugify(String(value), { lower: true, strict: true });
const query = (value) => String(value).toLowerCase().replace(/[^a-z0-9,]+/g, ',').replace(/^,+|,+$/g, '').slice(0, 140);
const localUrl = (rel) => `/uploads/demo/${rel}`;

function imageFile(buffer) {
  return (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) ||
    (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP');
}

function writeFallbackArtwork(appDir, rel, label, primary = '#4f46e5', accent = '#ec4899') {
  const base = rel.replace(/\.[^.]+$/, '');
  const fallbackRel = `${base}.svg`;
  const target = path.join(appDir, 'uploads', 'demo', fallbackRel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const words = String(label).replace(/[^a-zA-Z0-9 &-]/g, '').slice(0, 58);
  const safe = words.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = safe.match(/.{1,24}(?:\s|$)/g) || [safe];
  const title = lines.slice(0, 3).map((line, i) => `<text x="88" y="${690 + i * 54}" fill="#fff" font-family="Arial" font-size="42" font-weight="800">${line.trim()}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-opacity=".2"/></filter></defs><rect width="1000" height="1000" fill="#f8fafc"/><rect x="42" y="42" width="916" height="916" rx="64" fill="url(#g)"/><circle cx="790" cy="230" r="210" fill="#fff" opacity=".12"/><circle cx="220" cy="790" r="270" fill="#0f172a" opacity=".12"/><rect x="160" y="165" width="680" height="390" rx="40" fill="#fff" opacity=".94" filter="url(#s)"/><path d="M325 385h350M500 270v230" stroke="${primary}" stroke-width="34" stroke-linecap="round" opacity=".75"/><circle cx="500" cy="385" r="112" fill="none" stroke="${accent}" stroke-width="18" opacity=".85"/><text x="88" y="110" fill="#fff" font-family="Arial" font-size="24" font-weight="700" letter-spacing="4">${PLATFORM_NAME.toUpperCase()} CURATED PICK</text>${title}<text x="88" y="900" fill="#fff" opacity=".82" font-family="Arial" font-size="22" letter-spacing="3">TITLE-MATCHED LOCAL ARTWORK</text></svg>`;
  fs.writeFileSync(target, svg);
  return localUrl(fallbackRel);
}

function downloadImage(appDir, rel, search, unique = false, fallbackLabel = search, primary = '#4f46e5', accent = '#ec4899') {
  const target = path.join(appDir, 'uploads', 'demo', rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = `https://loremflickr.com/1000/1000/${query(search)}?lock=${LOCK++}`;
    try {
      execFileSync('curl', ['-fsSL', '--connect-timeout', '3', '--max-time', '7', url, '-o', target], { stdio: 'ignore' });
      const buffer = fs.readFileSync(target);
      if (buffer.length < 5000 || !imageFile(buffer)) continue;
      const hash = crypto.createHash('sha1').update(buffer).digest('hex');
      if (unique && USED_HASHES.has(hash)) continue;
      if (unique) USED_HASHES.add(hash);
      return localUrl(rel);
    } catch (_) {}
  }
  try { fs.unlinkSync(target); } catch (_) {}
  return writeFallbackArtwork(appDir, rel, fallbackLabel, primary, accent);
}

function writeLogo(appDir, rel, name, primary, accent) {
  const target = path.join(appDir, 'uploads', 'demo', rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const safe = String(name).replace(/&/g, '&amp;');
  fs.writeFileSync(target, `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="190" viewBox="0 0 720 190"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="720" height="190" rx="42" fill="#0b1020"/><circle cx="100" cy="95" r="55" fill="url(#g)"/><path d="M75 95h50M100 70v50" stroke="#fff" stroke-width="12" stroke-linecap="round"/><text x="185" y="88" fill="#fff" font-family="Arial" font-size="48" font-weight="800">${safe}</text><text x="188" y="125" fill="#cbd5e1" font-family="Arial" font-size="18" letter-spacing="4">CURATED COMMERCE</text></svg>`);
  return localUrl(rel);
}

function writeBrandLogo(appDir, rel, name, primary, accent) {
  const target = path.join(appDir, 'uploads', 'demo', rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const safe = String(name).replace(/&/g, '&amp;');
  fs.writeFileSync(target, `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="160" viewBox="0 0 420 160"><rect width="420" height="160" rx="30" fill="#fff"/><rect x="14" y="14" width="392" height="132" rx="22" fill="#f8fafc" stroke="${primary}" stroke-width="5"/><circle cx="86" cy="80" r="34" fill="${accent}"/><path d="M70 80h32M86 64v32" stroke="#fff" stroke-width="7" stroke-linecap="round"/><text x="140" y="91" fill="#0f172a" font-family="Arial" font-size="28" font-weight="800">${safe}</text></svg>`);
  return localUrl(rel);
}

const settings = async (key, value, group = 'general') => Settings.findOneAndUpdate(
  { key }, { $set: { key, value, group } }, { upsert: true, new: true, setDefaultsOnInsert: true },
);

const section = (type, data, paddingY = 'lg', backgroundColor = '', fullWidth = false) => ({
  id: uuid(), type, data,
  settings: { paddingY, backgroundColor, backgroundImage: '', fullWidth, visibility: 'all', schedule: { from: null, until: null } },
  responsiveOverrides: { mobile: {} },
});

const stores = [
  {
    key: 'fashion', appDir: 'tatoz-fashion', domain: 'fashion.tatoz.com', name: 'Tatoz Atelier', vendor: 'Tatoz Atelier', vendorSlug: 'tatoz-atelier', tagline: 'Modern style, thoughtfully edited.', primary: '#7c3aed', accent: '#f43f5e', bg: '#fff7ed', hero: 'split',
    categories: [['women', 'Women'], ['men', 'Men'], ['bags-accessories', 'Bags & Accessories'], ['watches', 'Watches'], ['jewelry', 'Jewelry']],
    brands: ['NOVA', 'Aurelia', 'Urban Thread', 'Veloce', 'Loom & Line'],
    products: [
      ['Linen Overshirt', 'men', 'Urban Thread', 2490, 'fashion,linen,overshirt'], ['Satin Slip Dress', 'women', 'Aurelia', 3290, 'fashion,satin,slip,dress'], ['Tailored Wide-Leg Trousers', 'women', 'Loom & Line', 2790, 'fashion,tailored,trousers'], ['Everyday Oxford Shirt', 'men', 'NOVA', 1890, 'fashion,oxford,shirt'], ['Relaxed Knit Cardigan', 'women', 'Aurelia', 2990, 'fashion,knit,cardigan'], ['Utility Cargo Pants', 'men', 'Veloce', 2390, 'fashion,cargo,pants'], ['Minimal Leather Tote', 'bags-accessories', 'Urban Thread', 3990, 'fashion,leather,tote,bag'], ['Studio Crossbody Bag', 'bags-accessories', 'Loom & Line', 2490, 'fashion,crossbody,bag'], ['Sculpted Chain Necklace', 'jewelry', 'Aurelia', 1790, 'fashion,chain,necklace,jewelry'], ['Signature Chronograph Watch', 'watches', 'Veloce', 6490, 'fashion,chronograph,wristwatch'], ['Everyday Leather Belt', 'bags-accessories', 'NOVA', 1290, 'fashion,leather,belt'], ['Merino Polo Sweater', 'men', 'Urban Thread', 2690, 'fashion,merino,polo,sweater'],
    ],
    heroQueries: ['fashion,editorial,clothing', 'fashion,women,streetstyle', 'fashion,accessories,studio'], heroText: ['Wear your point of view.', 'The new-season edit.', 'Details make the look.'],
    usp: [['sparkles', 'Curated style', 'Pieces with a point of view'], ['truck', 'Fast dispatch', 'Style delivered quickly'], ['rotate', 'Easy returns', 'Try it, love it or return it'], ['award', 'Quality first', 'Better materials, better feel']],
  },
  {
    key: 'electronics', appDir: 'tatoz-electronics', domain: 'electronics.tatoz.com', name: 'Tatoz Circuit', vendor: 'Tatoz Circuit', vendorSlug: 'tatoz-circuit', tagline: 'Power your everyday.', primary: '#0284c7', accent: '#22d3ee', bg: '#f0f9ff', hero: 'classic',
    categories: [['smartphones', 'Smartphones'], ['computing', 'Computing'], ['audio', 'Audio'], ['tv-entertainment', 'TV & Entertainment'], ['gaming', 'Gaming'], ['smart-home', 'Smart Home']],
    brands: ['Nexa', 'Voltix', 'PixelCore', 'SonicLab', 'Orbit Tech'],
    products: [
      ['Nexa X1 5G Smartphone', 'smartphones', 'Nexa', 32999, 'electronics,smartphone,phone'], ['Orbit Pro 14 Laptop', 'computing', 'Orbit Tech', 74990, 'electronics,laptop,work'], ['PixelCore Tab 11', 'computing', 'PixelCore', 28990, 'electronics,tablet'], ['SonicLab ANC Headphones', 'audio', 'SonicLab', 8990, 'electronics,headphones,anc'], ['SonicLab Air Buds', 'audio', 'SonicLab', 3490, 'electronics,wireless,earbuds'], ['Voltix 4K Creator Monitor', 'computing', 'Voltix', 26990, 'electronics,computer,monitor'], ['Orbit Stream 55 4K TV', 'tv-entertainment', 'Orbit Tech', 54990, 'electronics,television,tv'], ['Nexa Mirrorless Camera', 'tv-entertainment', 'Nexa', 62990, 'electronics,camera,mirrorless'], ['PixelCore Mechanical Keyboard', 'gaming', 'PixelCore', 4990, 'electronics,mechanical,keyboard'], ['Voltix Smart Speaker', 'smart-home', 'Voltix', 3990, 'electronics,smart,speaker'], ['Orbit Play Console', 'gaming', 'Orbit Tech', 42990, 'electronics,gaming,console'], ['Nexa GaN Fast Charger', 'smart-home', 'Nexa', 2490, 'electronics,charger,usb'],
    ],
    heroQueries: ['electronics,desk,technology', 'electronics,laptop,workspace', 'electronics,headphones,studio'], heroText: ['Sharper tools for bigger ideas.', 'Build your best setup.', 'Sound, power and focus.'],
    usp: [['zap', 'Future-ready', 'Tech that keeps up'], ['shield', 'Checked quality', 'Reliable picks only'], ['truck', 'Quick delivery', 'Packed with care'], ['headphones', 'Tech support', 'Help when you need it']],
  },
  {
    key: 'jewel', appDir: 'tatoz-jewel', domain: 'jewel.tatoz.com', name: 'Tatoz Luxe', vendor: 'Tatoz Luxe', vendorSlug: 'tatoz-luxe', tagline: 'Details that make the moment.', primary: '#a16207', accent: '#f59e0b', bg: '#fffbeb', hero: 'card',
    categories: [['rings', 'Rings'], ['necklaces', 'Necklaces'], ['earrings', 'Earrings'], ['bracelets', 'Bracelets'], ['watches', 'Watches']],
    brands: ['Lustre', 'Aurum House', 'Veloura', 'Mira Gems', 'Noir & Gold'],
    products: [
      ['Aurelia Vermeil Ring', 'rings', 'Lustre', 2490, 'jewelry,gold,ring'], ['Moonstone Drop Earrings', 'earrings', 'Veloura', 3190, 'jewelry,earrings,drop'], ['Celeste Pearl Necklace', 'necklaces', 'Aurum House', 4290, 'jewelry,pearl,necklace'], ['Noir Onyx Bracelet', 'bracelets', 'Noir & Gold', 2790, 'jewelry,onyx,bracelet'], ['Solstice Tennis Bracelet', 'bracelets', 'Mira Gems', 6990, 'jewelry,tennis,bracelet'], ['Aurora Pendant', 'necklaces', 'Lustre', 2390, 'jewelry,pendant,necklace'], ['Halo Stud Earrings', 'earrings', 'Veloura', 1890, 'jewelry,stud,earrings'], ['Signature Cuff Watch', 'watches', 'Aurum House', 7990, 'jewelry,luxury,wristwatch'], ['Eternity Band', 'rings', 'Mira Gems', 4990, 'jewelry,diamond,ring'], ['Initial Charm Necklace', 'necklaces', 'Noir & Gold', 2290, 'jewelry,charm,necklace'],
    ],
    heroQueries: ['luxury,jewelry,gold', 'jewelry,pearl,necklace', 'jewelry,ring,closeup'], heroText: ['The finishing touch.', 'Made for your moments.', 'Quietly unforgettable.'],
    usp: [['sparkles', 'Made to shine', 'Everyday luxury, refined'], ['shield', 'Quality materials', 'Details you can trust'], ['gift', 'Gift-ready', 'Beautifully presented'], ['rotate', 'Easy returns', 'Choose with confidence']],
  },
  {
    key: 'shoes', appDir: 'tatoz-shoes', domain: 'shoes.tatoz.com', name: 'Tatoz Stride', vendor: 'Tatoz Stride', vendorSlug: 'tatoz-stride', tagline: 'Find your next pair.', primary: '#0f766e', accent: '#f97316', bg: '#f0fdfa', hero: 'classic',
    categories: [['running', 'Running'], ['sneakers', 'Sneakers'], ['casual', 'Casual'], ['formal', 'Formal'], ['outdoor', 'Outdoor'], ['kids', 'Kids']],
    brands: ['Stride', 'Kinetix', 'Northstar', 'AeroStep', 'LaceLab'],
    products: [
      ['Cloud Runner 2.0', 'running', 'Stride', 5990, 'shoes,running,sneakers'], ['Street Runner Knit', 'sneakers', 'Kinetix', 4490, 'shoes,sneakers,street'], ['Court Classic Low', 'sneakers', 'Northstar', 3990, 'shoes,tennis,sneakers'], ['Trail Hiker Mid', 'outdoor', 'AeroStep', 6990, 'shoes,hiking,boots'], ['Leather Derby', 'formal', 'LaceLab', 5490, 'shoes,formal,derby'], ['Flex Knit Trainer', 'running', 'Stride', 4290, 'shoes,trainer,running'], ['High-Top Canvas', 'casual', 'Kinetix', 2990, 'shoes,high-top,canvas'], ['Court Low White', 'sneakers', 'Northstar', 3790, 'shoes,white,tennis'], ['Recovery Slides', 'casual', 'AeroStep', 1990, 'shoes,sandals,slides'], ['Chelsea Boot', 'formal', 'LaceLab', 6490, 'shoes,boots,chelsea'], ['Kids Active Sneaker', 'kids', 'Stride', 2290, 'shoes,kids,sneaker'], ['Foam Clog', 'casual', 'Kinetix', 1890, 'shoes,clog,casual'],
    ],
    heroQueries: ['shoes,sneakers,studio', 'shoes,running,athlete', 'shoes,boots,leather'], heroText: ['Move with intention.', 'Built for your pace.', 'Good days start from the ground up.'],
    usp: [['zap', 'Engineered comfort', 'Every step feels better'], ['truck', 'Fast dispatch', 'Your pair, on its way'], ['shield', 'Fit-first picks', 'Made for real movement'], ['rotate', 'Easy exchanges', 'Find your perfect fit']],
  },
  {
    key: 'toys', appDir: 'tatoz-toys', domain: 'toys.tatoz.com', name: 'Tatoz Playroom', vendor: 'Tatoz Playroom', vendorSlug: 'tatoz-playroom', tagline: 'Big imagination starts here.', primary: '#db2777', accent: '#facc15', bg: '#fff1f2', hero: 'classic',
    categories: [['building', 'Building Sets'], ['stem', 'STEM & Learning'], ['pretend-play', 'Pretend Play'], ['board-games', 'Board Games'], ['outdoor', 'Outdoor Toys'], ['puzzles', 'Puzzles']],
    brands: ['BrightBuild', 'LittleLab', 'PlayForge', 'WonderWorks', 'TinyTrail'],
    products: [
      ['Magnetic Tiles 100-Piece Set', 'building', 'BrightBuild', 1890, 'toy,magnetic,tiles,building'], ['Junior Science Lab Kit', 'stem', 'LittleLab', 1490, 'toy,science,experiment,kit'], ['Wooden Train Adventure Set', 'pretend-play', 'PlayForge', 2290, 'toy,wooden,train'], ['Family Strategy Board Game', 'board-games', 'WonderWorks', 1290, 'toy,board,game,family'], ['Remote Control Racer', 'outdoor', 'TinyTrail', 1990, 'toy,remote,car,racer'], ['Space Explorer Blocks', 'building', 'BrightBuild', 2490, 'toy,building,blocks,space'], ['Coding Buddy Robot', 'stem', 'LittleLab', 2990, 'toy,robot,coding'], ['1000-Piece World Puzzle', 'puzzles', 'WonderWorks', 990, 'toy,puzzle,jigsaw'], ['Pretend Grocery Store', 'pretend-play', 'PlayForge', 1690, 'toy,pretend,grocery,play'], ['Outdoor Play Tent', 'outdoor', 'TinyTrail', 2190, 'toy,play,tent,outdoor'], ['Dino Discovery Set', 'stem', 'BrightBuild', 1190, 'toy,dinosaur,discovery'], ['Family Card Game', 'board-games', 'WonderWorks', 590, 'toy,cards,game,family'],
    ],
    heroQueries: ['toy,children,playroom', 'toy,building,blocks', 'toy,board,game'], heroText: ['Play is serious fun.', 'Make room for wonder.', 'Curiosity looks good on everyone.'],
    usp: [['sparkles', 'Play-tested picks', 'Big fun, thoughtfully chosen'], ['shield', 'Age-friendly', 'Made for happy learning'], ['gift', 'Gift-ready', 'Easy wins for every occasion'], ['truck', 'Fast delivery', 'Let the fun begin sooner']],
  },
];

async function setUpSite(profile, appDir, categories, brands, heroes) {
  const logo = writeLogo(appDir, `${profile.key}/logo.svg`, profile.name, profile.primary, profile.accent);
  await settings('site_name', profile.name, 'site'); await settings('site_tagline', profile.tagline, 'site');
  await settings('site_logo', logo, 'site'); await settings('site_logo_dark', logo, 'site'); await settings('site_favicon', logo, 'site');
  await settings('site_theme', { brandColor: profile.primary, accentColor: profile.accent, textColor: '#0f172a', buttonStyle: profile.key === 'electronics' ? 'square' : 'pill', fontFamily: profile.key === 'fashion' || profile.key === 'jewel' ? 'Georgia, serif' : 'Inter, ui-sans-serif, system-ui, sans-serif' }, 'site');
  await settings('site_social', { instagram: 'https://instagram.com/tatoz', facebook: 'https://facebook.com/tatoz' }, 'site');
  await settings('site_contact', { email: `care@${profile.domain}`, phone: '+91 98765 43210', address: 'New Delhi, India' }, 'site');
  await settings('currency', 'INR', 'store'); await settings('currency_symbol', '₹', 'store'); await settings('free_shipping_threshold', 999, 'store'); await settings('standard_shipping_cost', 49, 'store'); await settings('tax_rate', 18, 'store');
  await settings('seo_title_template', `%s | ${profile.name}`, 'seo'); await settings('seo_meta_description', `${profile.name}: ${profile.tagline} Shop a focused collection with trusted products and easy delivery.`, 'seo'); await settings('seo_canonical_base', `https://${profile.domain}`, 'seo'); await settings('seo_og_image', heroes[0], 'seo'); await settings('seo_sitemap_enabled', true, 'seo');
  await settings('site_banners_hero', heroes.map((imageUrl, i) => ({ imageUrl, title: profile.heroText[i], subtitle: profile.tagline, cta: 'Shop the edit', link: '/search' })), 'banners');
  const tiles = categories.slice(0, 3).map(c => ({ imageUrl: c.image, heading: c.name, link: `/category/${c.slug}` }));
  const layout = { sections: [
    section('announcementBar', { text: `${profile.name} — ${profile.tagline}`, linkLabel: 'Explore now', linkUrl: '/search', backgroundColor: profile.primary, textColor: '#fff', dismissible: false }, 'none', profile.primary, true),
    section('hero', { variant: profile.hero, aspectRatio: '2.15/1', transition: 'fade', showArrows: true, showDots: true, autoplay: true, intervalMs: 5200, slides: heroes.map((imageUrl, i) => ({ imageUrl, headline: profile.heroText[i], subheadline: profile.tagline, ctaLabel: 'Shop the edit', ctaLink: '/search', alignment: 'left', overlayOpacity: profile.key === 'jewel' ? 0.2 : 0.35 })) }, 'none', '', true),
    section('uspRow', { columns: 4, items: profile.usp.map(([icon, heading, subtext]) => ({ icon, heading, subtext })) }, 'lg', profile.bg),
    section('categoriesShowcase', { heading: profile.key === 'jewel' ? 'Shop the collection' : 'Shop by category', categoryIds: categories.map(c => String(c._id)), layout: profile.key === 'jewel' ? 'circle' : 'square' }),
    section('productsShowcase', { heading: 'Best of the edit', source: 'collection', collection: 'featured', layout: 'grid', count: 12, seeAllLink: '/search?featured=1' }),
    section('mosaic', { heading: profile.key === 'toys' ? 'Play by mood' : 'Explore the edit', preset: '1+2', tiles }),
    section('countdown', { heading: profile.key === 'electronics' ? 'Setup week savings' : 'Limited-time favourites', subheading: `Special picks from ${profile.name}.`, endsAt: new Date(NOW + 8 * DAY).toISOString(), ctaLabel: 'Shop the offer', ctaLink: '/search?flashDeal=1', backgroundColor: profile.primary, textColor: '#fff', expiredMessage: 'Offer has ended' }, 'lg', profile.bg),
    section('productsShowcase', { heading: 'New in', source: 'collection', collection: 'newest', layout: 'grid', count: 8, seeAllLink: '/search?sort=newest' }),
    section('brandStrip', { heading: 'Brands in this edit', brandIds: brands.map(b => String(b._id)), style: 'marquee', grayscale: false }, 'xl', profile.bg),
    section('testimonials', { heading: profile.key === 'toys' ? 'Big smiles, real families' : 'Chosen by people like you', layout: 'grid', columns: 3, items: ['Aanya Mehta', 'Rohan Kapoor', 'Nisha Sharma'].map((name, i) => ({ quote: `The ${profile.name} edit feels focused, thoughtful and easy to shop.`, authorName: name, authorTitle: 'Verified shopper', avatarUrl: avatar(name, i === 0 ? profile.primary : i === 1 ? profile.accent : '334155'), rating: 5 })) }),
    section('newsletter', { heading: `Stay close to ${profile.name}`, subheading: profile.tagline, placeholder: 'you@example.com', buttonLabel: 'Join the list', successMessage: 'You are on the list!', style: 'wide' }, 'xl', profile.primary),
  ] };
  await Page.findOneAndUpdate({ isHomepage: true }, { $set: { slug: '/', title: profile.name, isHomepage: true, status: 'published', draftLayout: layout, publishedLayout: layout, seo: { metaTitle: `${profile.name} | ${profile.tagline}`, metaDescription: profile.tagline, ogImage: heroes[0], canonical: `https://${profile.domain}/` }, pageSettings: { showHeader: true, showFooter: true, backgroundColor: '#fff' } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function seedSpecial(profile) {
  const appDir = path.join(HOME, profile.appDir);
  const env = dotenv.parse(fs.readFileSync(path.join(appDir, '.env')));
  const heroes = profile.heroQueries.map((q, i) => downloadImage(appDir, `${profile.key}/hero-${i + 1}.jpg`, q, false)).filter(Boolean);
  const categoryImages = {};
  for (const [catSlug, name] of profile.categories) categoryImages[catSlug] = downloadImage(appDir, `${profile.key}/categories/${catSlug}.jpg`, `${profile.key},${name}`, false);
  const brandImages = Object.fromEntries(profile.brands.map(name => [name, writeBrandLogo(appDir, `${profile.key}/brands/${slug(name)}.svg`, name, profile.primary, profile.accent)]));
  const productsWithImages = profile.products.map((p, i) => ({ p, image: downloadImage(appDir, `${profile.key}/products/${slug(p[0])}.jpg`, p[4], true, p[0], profile.primary, profile.accent) })).filter(x => x.image);
  if (heroes.length < 3) throw new Error(`${profile.key}: hero images unavailable`);

  await mongoose.connect(env.MONGO_URI);
  const admin = await User.findOne({ role: 'superadmin' });
  if (!admin) throw new Error(`${profile.key}: superadmin missing`);
  await Review.deleteMany({}); await Product.deleteMany({}); await Category.deleteMany({}); await Brand.deleteMany({}); await Coupon.deleteMany({}); await Blog.deleteMany({}); await BlogCategory.deleteMany({}); await LegalPage.deleteMany({}); await Page.deleteMany({ isHomepage: true });
  const categories = await Category.insertMany(profile.categories.map(([s, name], i) => ({ name, slug: s, description: `${name} from ${profile.name}.`, image: categoryImages[s] || '', order: i + 1, isActive: true })));
  const categoryMap = Object.fromEntries(categories.map(c => [c.slug, c._id]));
  const brands = await Brand.insertMany(profile.brands.map((name, i) => ({ name, slug: slug(name), description: `${name} — a signature label at ${profile.name}.`, image: brandImages[name], order: i + 1, isActive: true })));
  const brandMap = Object.fromEntries(brands.map(b => [b.name, b._id]));
  const logo = writeLogo(appDir, `${profile.key}/logo.svg`, profile.name, profile.primary, profile.accent);
  const vendor = await Vendor.findOneAndUpdate({ slug: profile.vendorSlug }, { $set: { owner: admin._id, storeName: profile.vendor, slug: profile.vendorSlug, logo, banner: heroes[0], description: `${profile.name} — ${profile.tagline}`, contactEmail: `care@${profile.domain}`, contactPhone: '+91 98765 43210', status: 'active', approvedAt: new Date(), approvedBy: admin._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const docs = productsWithImages.map(({ p, image }, i) => { const [title, cat, brand, price, terms] = p; const comparePrice = Math.round(price * 1.22 / 10) * 10; return { title, slug: `${profile.key}-${slug(title)}`, description: `${title} by ${brand}. A considered pick from ${profile.name}, selected for quality and everyday value.`, shortDescription: `${brand} ${title}. Ships quickly across India.`, price, comparePrice, discount: Math.round(((comparePrice - price) / comparePrice) * 100), images: [{ url: image, alt: title }], thumbnail: image, category: categoryMap[cat], brand, sku: `${profile.key.toUpperCase()}-${String(i + 1).padStart(4, '0')}`, stock: 30 + i * 3, lowStockThreshold: 8, tags: query(terms).split(','), isActive: true, isFeatured: i < 8, isFlashDeal: i < 4, flashDealExpiry: new Date(NOW + 8 * DAY), ratings: { average: 4.3 + ((i % 5) / 10), count: 12 + i * 3 }, seo: { metaTitle: `${title} | ${profile.name}`, metaDescription: `Shop ${title} by ${brand} at ${profile.name}.`, keywords: [title, brand, profile.name] }, vendor: vendor._id, totalSales: 500 - i * 11, views: 1600 - i * 17 }; });
  const products = await Product.insertMany(docs);
  await Vendor.updateOne({ _id: vendor._id }, { $set: { stats: { totalProducts: products.length, activeProducts: products.length } } });
  const demoUsers = await Promise.all(['Aanya Mehta', 'Rohan Kapoor', 'Nisha Sharma'].map((name, i) => User.findOneAndUpdate({ email: `demo.${profile.key}.${i}@tatoz.com` }, { $set: { name, role: 'customer', isActive: true, isEmailVerified: true, avatar: avatar(name, i === 0 ? profile.primary : i === 1 ? profile.accent : '334155') } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
  await Review.insertMany(products.slice(0, 9).map((p, i) => ({ product: p._id, user: demoUsers[i % 3]._id, rating: 4 + (i % 2), title: 'Lovely pick', comment: `The ${p.title} arrived as described and feels like a great choice.`, isVerifiedPurchase: true, status: 'approved', helpful: i + 3 })));
  const expiresAt = new Date(NOW + 90 * DAY); await Coupon.insertMany([{ code: `WELCOME${profile.key.slice(0, 3).toUpperCase()}`, description: `10% off your first ${profile.name} order`, type: 'percentage', value: 10, minOrderAmount: 999, maxDiscount: 500, usageLimit: 1000, userLimit: 1, isActive: true, showOnCheckout: true, isFirstOrderOnly: true, startDate: new Date(NOW - DAY), expiresAt }, { code: `SAVE${profile.key.slice(0, 3).toUpperCase()}500`, description: 'Save ₹500 on orders above ₹4,999', type: 'fixed', value: 500, minOrderAmount: 4999, usageLimit: 1000, userLimit: 2, isActive: true, showOnCheckout: true, startDate: new Date(NOW - DAY), expiresAt }]);
  const blogCat = await BlogCategory.create({ name: `${profile.name} Journal`, slug: `${profile.key}-journal`, description: `Ideas from ${profile.name}.`, image: heroes[1], isActive: true });
  await Blog.create({ title: `The ${profile.name} edit: how to choose better`, slug: `${profile.key}-choose-better`, excerpt: `A focused guide to shopping the ${profile.name} collection.`, content: `<h2>Choose what fits your life</h2><p>${profile.tagline} The best products are the ones you reach for again and again.</p>`, featuredImage: heroes[1], category: blogCat._id, author: admin._id, status: 'published', publishedAt: new Date(), isFeatured: true, readTime: 4, tags: [profile.key, 'guide'] });
  await LegalPage.create({ slug: 'shipping-policy', title: 'Shipping Policy', content: `<h2>Quick, clear delivery</h2><p>${profile.name} ships across India with updates along the way.</p>`, isActive: true, updatedBy: admin._id });
  await LegalPage.create({ slug: 'return-policy', title: 'Returns & Refunds', content: `<h2>Easy returns</h2><p>If your order is not right, contact us within 7 days for eligible returns.</p>`, isActive: true, updatedBy: admin._id });
  await setUpSite(profile, appDir, categories, brands, heroes);
  console.log(JSON.stringify({ store: profile.key, products: products.length, skippedImages: profile.products.length - products.length, categories: categories.length, brands: brands.length }, null, 2));
  await mongoose.disconnect();
}

async function repairMain() {
  const appDir = path.join(HOME, 'tatoz'); const env = dotenv.parse(fs.readFileSync(path.join(appDir, '.env'))); await mongoose.connect(env.MONGO_URI);
  const categories = await Category.find().sort({ order: 1 }).lean(); const brands = await Brand.find().sort({ order: 1 }).lean(); const products = await Product.find().populate('category', 'name slug').sort({ createdAt: 1 });
  for (const c of categories) { const u = downloadImage(appDir, `main/categories/${c.slug}.jpg`, `shopping,${c.name}`, false); await Category.updateOne({ _id: c._id }, { $set: { image: u || '' } }); }
  for (const b of brands) await Brand.updateOne({ _id: b._id }, { $set: { image: writeBrandLogo(appDir, `main/brands/${slug(b.name)}.svg`, b.name, '#4f46e5', '#ec4899') } });
  const results = products.map(p => ({ p, image: downloadImage(appDir, `main/products/${p.slug}.jpg`, `${p.title},${p.category?.name || 'product'}`, true, p.title, '#4f46e5', '#ec4899') })); const good = results.filter(x => x.image); const bad = results.filter(x => !x.image).map(x => x.p._id);
  if (bad.length) await Product.deleteMany({ _id: { $in: bad } }); for (const x of good) await Product.updateOne({ _id: x.p._id }, { $set: { images: [{ url: x.image, alt: x.p.title }], thumbnail: x.image } });
  const heroes = ['shopping,marketplace,store', 'fashion,electronics,shopping', 'home,shopping,lifestyle'].map((q, i) => downloadImage(appDir, `main/hero-${i + 1}.jpg`, q, false)); const logo = writeLogo(appDir, 'main/logo.svg', `${PLATFORM_NAME} Marketplace`, '#4f46e5', '#ec4899'); await settings('site_logo', logo, 'site'); await settings('site_logo_dark', logo, 'site'); await settings('site_favicon', logo, 'site'); await settings('seo_og_image', heroes[0], 'seo');
  const layout = { sections: [section('announcementBar', { text: `${PLATFORM_NAME} Marketplace — shop more, discover better`, linkLabel: 'Explore', linkUrl: '/search', backgroundColor: '#0f172a', textColor: '#fff', dismissible: false }, 'none', '#0f172a', true), section('hero', { variant: 'classic', aspectRatio: '2.15/1', transition: 'fade', showArrows: true, showDots: true, autoplay: true, intervalMs: 5500, slides: heroes.map((imageUrl, i) => ({ imageUrl, headline: ['Everything, better.', 'Find your next favourite.', 'A better way to shop.'][i], subheadline: 'Fashion, technology, home, beauty and everyday essentials.', ctaLabel: 'Shop now', ctaLink: '/search', alignment: 'left', overlayOpacity: 0.35 })) }, 'none', '', true), section('categoriesShowcase', { heading: 'Explore every category', categoryIds: categories.slice(0, 12).map(c => String(c._id)), layout: 'square' }), section('productsShowcase', { heading: 'Trending now', source: 'collection', collection: 'featured', layout: 'grid', count: 12, seeAllLink: '/search?featured=1' }), section('productsShowcase', { heading: 'New arrivals', source: 'collection', collection: 'newest', layout: 'grid', count: 12, seeAllLink: '/search?sort=newest' }), section('brandStrip', { heading: 'Shop trusted brands', brandIds: brands.slice(0, 16).map(b => String(b._id)), style: 'marquee', grayscale: false }, 'xl', '#f8fafc'), section('productsShowcase', { heading: 'Bestsellers', source: 'collection', collection: 'bestsellers', layout: 'horizontalScroll', count: 12, seeAllLink: '/search?sort=bestseller' }), section('newsletter', { heading: 'Good finds, straight to you', subheading: 'New drops, useful guides and private offers.', placeholder: 'you@example.com', buttonLabel: 'Subscribe', successMessage: 'You are on the list!', style: 'wide' }, 'xl', '#0f172a')] };
  await Page.findOneAndUpdate({ isHomepage: true }, { $set: { title: `${PLATFORM_NAME} Marketplace`, draftLayout: layout, publishedLayout: layout, seo: { metaTitle: `${PLATFORM_NAME} Marketplace | Everything, Better`, metaDescription: `Shop everything you love at ${PLATFORM_NAME}.`, ogImage: heroes[0], canonical: 'https://tatoz.com/' } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const vendor = await Vendor.findOne({ slug: 'tatoz-official' }); if (vendor) await Vendor.updateOne({ _id: vendor._id }, { $set: { stats: { totalProducts: good.length, activeProducts: good.length }, logo, banner: heroes[0] } });
  console.log(JSON.stringify({ store: 'main', before: products.length, kept: good.length, removed: bad.length }, null, 2)); await mongoose.disconnect();
}

(async () => { for (const profile of stores) await seedSpecial(profile); await repairMain(); })().catch(async (error) => { console.error(error); try { await mongoose.disconnect(); } catch (_) {} process.exit(1); });
