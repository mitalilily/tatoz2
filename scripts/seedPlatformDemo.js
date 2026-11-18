require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');
const slugify = require('slugify');
const connectDB = require('../config/db');
const { ensureInvoiceForOrder } = require('../services/invoiceService');

const Tenant = require('../models/Tenant');
const User = require('../models/User');
const TenantCustomer = require('../models/TenantCustomer');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Bundle = require('../models/Bundle');
const Review = require('../models/Review');
const Order = require('../models/Order');
const PaymentAttempt = require('../models/PaymentAttempt');
const PaymentTransaction = require('../models/PaymentTransaction');
const Shipment = require('../models/Shipment');
const ShipmentEvent = require('../models/ShipmentEvent');
const Invoice = require('../models/Invoice');
const Coupon = require('../models/Coupon');
const BlogCategory = require('../models/BlogCategory');
const Blog = require('../models/Blog');
const Notification = require('../models/Notification');
const InventoryMovement = require('../models/InventoryMovement');
const TaxProfile = require('../models/TaxProfile');
const CustomerWallet = require('../models/CustomerWallet');
const WalletTransaction = require('../models/WalletTransaction');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const LoyaltyAccount = require('../models/LoyaltyAccount');
const LoyaltyTransaction = require('../models/LoyaltyTransaction');
const GiftCard = require('../models/GiftCard');
const GiftCardTransaction = require('../models/GiftCardTransaction');
const { PLATFORM_NAME } = require('../constants/branding');

const DEMO_PREFIX = 'demo-';
const DEMO_PASSWORD = 'DemoCustomer123!';
const now = Date.now();

const image = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=85`;

const CATEGORY_DEFS = [
  { key: 'fashion', name: 'Fashion & Apparel', image: '1521572163474-6864f9cf17ab', base: 1299, products: ['Cloudline Everyday Tee', 'Alpine Fleece Hoodie', 'Studio Relaxed Trousers', 'Metro Denim Jacket'], brands: ['Northstar', 'Aster', 'Lumen', 'Northstar'] },
  { key: 'footwear', name: 'Footwear', image: '1542291026-7eec264c27ff', base: 2499, products: ['Stride Everyday Runner', 'Courtline Canvas Sneaker', 'Trailmark Hiking Shoe', 'Aero Knit Trainer'], brands: ['Apex', 'Forma', 'Summit', 'Apex'] },
  { key: 'electronics', name: 'Electronics & Gadgets', image: '1517336714731-489689fd1ca8', base: 4999, products: ['Pulse Wireless Headphones', 'Orbit Smart Display', 'Nova Mechanical Keyboard', 'Beam Portable Speaker'], brands: ['Orbit', 'Nova', 'Brightline', 'Orbit'] },
  { key: 'home', name: 'Home & Living', image: '1556909114-f6e7ad7d3136', base: 1899, products: ['Arc Reading Lamp', 'Haven Storage Shelf', 'Craftstone Dinner Set', 'Cloudrest Cushion Set'], brands: ['Cedar', 'Mosaic', 'Craft & Co', 'Cedar'] },
  { key: 'beauty', name: 'Beauty & Skincare', image: '1596462502278-27bfdc403348', base: 549, products: ['Dewdrop Face Serum', 'Velvet Matte Tint', 'Botanical Repair Shampoo', 'Solar Veil SPF 50'], brands: ['Everwell', 'Lumen', 'Everwell', 'Aster'] },
  { key: 'bags', name: 'Bags & Travel', image: '1553062407-98eeb64c6a62', base: 1599, products: ['Transit Laptop Backpack', 'Nomad Weekend Duffel', 'Everyday Canvas Tote', 'Summit Trek Pack'], brands: ['Harbor', 'Terra', 'Mosaic', 'Summit'] },
  { key: 'watches', name: 'Watches & Wearables', image: '1524805444758-089113d48a6d', base: 2199, products: ['Meridian Field Watch', 'Pulse Active Watch', 'Atlas Chronograph', 'Halo Smart Band'], brands: ['Northstar', 'Orbit', 'Harbor', 'Nova'] },
  { key: 'sports', name: 'Sports & Outdoors', image: '1517649763962-0c623066013b', base: 999, products: ['Flex Training Mat', 'Peak Resistance Kit', 'Trailblazer Tent', 'Sprint Hydration Pack'], brands: ['Fieldhouse', 'Summit', 'Terra', 'Fieldhouse'] },
  { key: 'books', name: 'Books & Learning', image: '1544947950-fa07a98d237f', base: 399, products: ['The Focus Playbook', 'Build Better Habits', 'Modern Design Handbook', 'The Curious Mind'], brands: ['Paperplane', 'Paperplane', 'Brightline', 'Paperplane'] },
  { key: 'toys', name: 'Toys & Games', image: '1596461404969-9ae70f2830c1', base: 799, products: ['Maker Brick Studio', 'Galaxy Puzzle Lab', 'Storytime Puppet Set', 'Strategy Board Quest'], brands: ['Kite', 'Kite', 'Mosaic', 'Kite'] },
  { key: 'jewelry', name: 'Jewelry & Accessories', image: '1599643478518-a784e5dc4c8f', base: 899, products: ['Solstice Pendant', 'Orbit Hoop Earrings', 'Luna Stackable Ring', 'Cove Chain Bracelet'], brands: ['Aster', 'Lumen', 'Aster', 'Harbor'] },
  { key: 'health', name: 'Health & Wellness', image: '1556228720-195a672e8a03', base: 699, products: ['Daily Balance Vitamins', 'Calm Night Essential Oil', 'Hydrate Steel Bottle', 'Restore Massage Roller'], brands: ['Everwell', 'Everwell', 'Terra', 'Fieldhouse'] },
  { key: 'pets', name: 'Pet Supplies', image: '1601758228041-f3b2795255f1', base: 599, products: ['Paws Comfort Bed', 'Whisker Play Tower', 'Daily Walk Harness', 'Healthy Bowl Set'], brands: ['Cedar', 'Kite', 'Harbor', 'Cedar'] },
  { key: 'office', name: 'Office & Stationery', image: '1497032628192-86f99bc70b22', base: 349, products: ['Focus Desk Planner', 'Arc Stationery Kit', 'Ergo Desk Organizer', 'Studio Sketch Pad'], brands: ['Paperplane', 'Brightline', 'Mosaic', 'Paperplane'] },
];

const BRAND_DEFS = [
  ['Northstar', 'Everyday apparel and accessories made for movement.'],
  ['Aster', 'Clean, considered design for modern routines.'],
  ['Lumen', 'Bright color and confident personal style.'],
  ['Apex', 'Performance footwear for work, training, and weekends.'],
  ['Forma', 'Functional objects with a refined silhouette.'],
  ['Summit', 'Reliable equipment for travel and the outdoors.'],
  ['Orbit', 'Connected gadgets that keep life moving.'],
  ['Nova', 'Smart, expressive technology for daily use.'],
  ['Brightline', 'Focused tools for creative and productive work.'],
  ['Cedar', 'Warm home essentials built to last.'],
  ['Mosaic', 'Colorful, versatile pieces for every space.'],
  ['Craft & Co', 'Thoughtful materials and practical craftsmanship.'],
  ['Everwell', 'Simple wellness rituals for everyday balance.'],
  ['Harbor', 'Travel-ready essentials with dependable construction.'],
  ['Terra', 'Outdoor-minded products inspired by the natural world.'],
  ['Fieldhouse', 'Training essentials for stronger routines.'],
  ['Paperplane', 'Books and stationery for curious minds.'],
  ['Kite', 'Playful ideas that make learning more engaging.'],
];

const BRAND_IMAGES = [
  '1529139574466-a303027c1d8b', '1523275335684-37898b6baf30', '1515886657613-9f3515b0c78f',
  '1542291026-7eec264c27ff', '1494438639946-1ebd1d20bf85', '1511497584788-876760111969',
  '1517336714731-489689fd1ca8', '1496181133206-80ce9b88a853', '1499750310107-5fef28a66643',
  '1556228720-195a672e8a03', '1493663284031-b7e3aefcae8e', '1556911220-bff31c812dba',
];

const CUSTOMER_NAMES = [
  ['Aarav Mehta', 'demo.customer01@example.com', '9810001001', 'Mumbai', 'Maharashtra', '400001'],
  ['Diya Sharma', 'demo.customer02@example.com', '9810001002', 'Delhi', 'Delhi', '110001'],
  ['Kabir Rao', 'demo.customer03@example.com', '9810001003', 'Bengaluru', 'Karnataka', '560001'],
  ['Anaya Iyer', 'demo.customer04@example.com', '9810001004', 'Chennai', 'Tamil Nadu', '600001'],
  ['Vihaan Kapoor', 'demo.customer05@example.com', '9810001005', 'Pune', 'Maharashtra', '411001'],
  ['Meera Nair', 'demo.customer06@example.com', '9810001006', 'Kochi', 'Kerala', '682001'],
  ['Arjun Singh', 'demo.customer07@example.com', '9810001007', 'Jaipur', 'Rajasthan', '302001'],
  ['Sara Khan', 'demo.customer08@example.com', '9810001008', 'Hyderabad', 'Telangana', '500001'],
  ['Rohan Das', 'demo.customer09@example.com', '9810001009', 'Kolkata', 'West Bengal', '700001'],
  ['Ishita Verma', 'demo.customer10@example.com', '9810001010', 'Ahmedabad', 'Gujarat', '380001'],
  ['Neil Joseph', 'demo.customer11@example.com', '9810001011', 'Goa', 'Goa', '403001'],
  ['Myra Patel', 'demo.customer12@example.com', '9810001012', 'Surat', 'Gujarat', '395001'],
  ['Advik Rao', 'demo.customer13@example.com', '9810001013', 'Lucknow', 'Uttar Pradesh', '226001'],
  ['Tara Menon', 'demo.customer14@example.com', '9810001014', 'Coimbatore', 'Tamil Nadu', '641001'],
  ['Reyansh Gupta', 'demo.customer15@example.com', '9810001015', 'Chandigarh', 'Chandigarh', '160001'],
  ['Zoya Ali', 'demo.customer16@example.com', '9810001016', 'Bhopal', 'Madhya Pradesh', '462001'],
  ['Ayaan Bose', 'demo.customer17@example.com', '9810001017', 'Bhubaneswar', 'Odisha', '751001'],
  ['Kavya Shah', 'demo.customer18@example.com', '9810001018', 'Indore', 'Madhya Pradesh', '452001'],
];

const ORDER_STATUSES = ['delivered', 'shipped', 'processing', 'confirmed', 'pending', 'cancelled', 'returned', 'out_for_delivery'];
const REVIEW_TITLES = ['Beautiful quality', 'Exactly as described', 'A great everyday pick', 'Worth the price', 'Fast delivery and neat packing', 'Would recommend'];
const REVIEW_COMMENTS = [
  'The finish is thoughtful and the product feels better than expected. It has become part of my daily routine.',
  'The details match the listing, packaging was secure, and the overall experience was smooth.',
  'Good quality for the price. The fit and usability are both excellent for regular use.',
  'A polished demo product with a practical design. I would happily buy it again.',
  'Arrived on time and looked exactly like the photos. Customer support was also helpful.',
  'The materials feel durable and the small details make this a very pleasant purchase.',
];

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const slug = value => slugify(value, { lower: true, strict: true });
const money = value => Math.round(Number(value) * 100) / 100;
const keyFor = value => `${DEMO_PREFIX}${slug(value)}`;

const variantPlan = key => {
  if (['fashion', 'footwear'].includes(key)) return [{ name: 'Size', options: ['S', 'M', 'L', 'XL'] }, { name: 'Color', options: ['Midnight', 'Cloud', 'Sage'] }];
  if (['beauty', 'jewelry'].includes(key)) return [{ name: 'Shade', options: ['Dawn', 'Rose', 'Cocoa'] }, { name: 'Pack', options: ['Single', 'Duo'] }];
  if (['electronics', 'watches'].includes(key)) return [{ name: 'Color', options: ['Graphite', 'Silver', 'Ocean'] }, { name: 'Storage', options: ['Standard', 'Plus'] }];
  if (['books', 'office'].includes(key)) return [{ name: 'Format', options: ['Paperback', 'Hardcover', 'Deluxe'] }, { name: 'Edition', options: ['Standard', 'Collector'] }];
  if (['toys', 'pets'].includes(key)) return [{ name: 'Size', options: ['Small', 'Medium', 'Large'] }, { name: 'Pack', options: ['Single', 'Family'] }];
  return [{ name: 'Size', options: ['Compact', 'Regular', 'Large'] }, { name: 'Finish', options: ['Natural', 'Stone', 'Charcoal'] }];
};

const makeImages = category => {
  // Every product's primary image must match its category. The previous
  // rotating gallery selected a bag image for products in unrelated groups.
  return [1, 2, 3].map(index => ({ url: image(category.image), alt: `${category.name} product view ${index}` }));
};

const htmlDescription = ({ title, brand, category, tags, specs }) => `
<article class="product-rich-description">
  <h2>${esc(title)} by ${esc(brand)}</h2>
  <p>Meet a considered everyday essential from our ${esc(category)} collection. ${esc(title)} is designed for real routines, reliable performance, and a finish that feels special from the first use.</p>
  <h3>Why you will love it</h3>
  <ul>${tags.map(tag => `<li>${esc(tag[0].toUpperCase() + tag.slice(1))} design detail for comfortable, repeat use.</li>`).join('')}</ul>
  <h3>Product details</h3>
  <p>Each piece is quality checked, carefully packed, and supported by our straightforward delivery and returns experience. The product images are editorial demo assets sourced from Unsplash.</p>
  <h3>Specifications</h3>
  <table><tbody>${specs.map(spec => `<tr><th>${esc(spec.key)}</th><td>${esc(spec.value)}</td></tr>`).join('')}</tbody></table>
</article>`;

const buildProduct = ({ category, categoryDoc, brand, brandDoc, name, productIndex, createdBy, vendor }) => {
  const basePrice = category.base + ((productIndex * 317) % Math.max(500, Math.round(category.base * 0.65)));
  const comparePrice = Math.round(basePrice * 1.2 / 10) * 10;
  const tags = [category.key, 'demo collection', 'everyday essential', productIndex % 2 ? 'best seller' : 'new arrival'];
  const specs = [
    { key: 'Collection', value: `${PLATFORM_NAME} Demo Collection` },
    { key: 'Material', value: productIndex % 2 ? 'Premium blended materials' : 'Responsibly selected materials' },
    { key: 'Care', value: 'Use and care according to the included product guide' },
    { key: 'Dispatch', value: 'Ships in 1-2 business days' },
  ];
  const images = makeImages(category);
  const variants = variantPlan(category.key).map((variant, variantIndex) => ({
    name: variant.name,
    options: variant.options.map((value, optionIndex) => {
      const price = money(basePrice + (optionIndex * 75) + (variantIndex * 25));
      const optionImages = [images[(optionIndex + variantIndex) % images.length]];
      return {
        value,
        stock: 20 + ((productIndex + optionIndex) % 5) * 8,
        price,
        comparePrice: money(price * 1.2),
        discount: Math.round((1 - price / (price * 1.2)) * 100),
        images: optionImages,
        thumbnail: optionImages[0].url,
      };
    }),
  }));
  const title = `${name} — Demo Edition`;
  const productSlug = keyFor(`${category.key}-${name}`);
  return {
    tenant: categoryDoc.tenant,
    title,
    slug: productSlug,
    description: htmlDescription({ title, brand: brand.name, category: category.name, tags, specs }),
    shortDescription: `${brand.name} ${name}: an editorial demo product with live variants, stock, pricing, and rich details.`,
    price: basePrice,
    comparePrice,
    discount: Math.round((1 - basePrice / comparePrice) * 100),
    images,
    thumbnail: images[0].url,
    category: categoryDoc._id,
    brand: brand.name,
    sku: `DEMO-${category.key.slice(0, 4).toUpperCase()}-${String(productIndex + 1).padStart(3, '0')}`,
    hsnCode: category.key === 'books' ? '4901' : '8517',
    barcode: `890000${String(productIndex + 1).padStart(7, '0')}`,
    gstRate: category.key === 'books' ? 5 : 18,
    costPrice: money(basePrice * 0.58),
    wholesalePrice: money(basePrice * 0.72),
    stock: 160 + productIndex * 5,
    lowStockThreshold: 12,
    incomingStock: 40,
    variants,
    variantType: 'variable',
    productKind: 'physical',
    specifications: specs,
    lifecycleStatus: 'active',
    tags,
    isActive: true,
    isFeatured: productIndex % 4 === 0,
    isFlashDeal: productIndex % 9 === 0,
    ratings: { average: 4.2, count: 0 },
    seo: {
      metaTitle: `${title} | ${PLATFORM_NAME} Demo Store`,
      metaDescription: `Shop ${title} by ${brand.name}. Rich product details, live variants, and reliable delivery from ${PLATFORM_NAME}.`,
      keywords: [category.name, brand.name, name, `${PLATFORM_NAME} demo`],
      altText: `${title} product image`,
      focusKeyword: name,
      ogTitle: title,
      ogDescription: `Explore ${title} from the ${PLATFORM_NAME} demo catalog.`,
      ogImage: images[0].url,
    },
    attributes: { color: ['Midnight', 'Cloud'], material: specs[1].value, brand: brand.name, detectedCategory: category.name, features: tags },
    weight: 0.4 + (productIndex % 5) * 0.2,
    dimensions: { length: 20 + productIndex % 10, width: 15, height: 8 },
    shippingClass: 'standard',
    createdBy,
    vendor,
  };
};

async function ensureTenant() {
  const tenant = await Tenant.findOneAndUpdate(
    { key: 'platform' },
    { $set: { name: PLATFORM_NAME, slug: 'platform', type: 'platform', status: 'active' }, $setOnInsert: { key: 'platform', domains: [{ host: 'tatoz.com', verified: true, primary: true }, { host: 'www.tatoz.com', verified: true, primary: false }] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Tenant.updateOne({ _id: tenant._id }, { $addToSet: { domains: { $each: [{ host: 'tatoz.com', verified: true, primary: true }, { host: 'www.tatoz.com', verified: true, primary: false }] } } });
  return tenant;
}

async function ensureAdmin() {
  return User.findOne({ role: 'superadmin', isActive: true }).sort({ createdAt: 1 });
}

async function ensureVendor({ tenant, admin }) {
  if (!admin) throw new Error('An active superadmin is required before seeding the demo platform');
  let vendor = await Vendor.findOne({ slug: 'tatoz-official' });
  if (!vendor) {
    vendor = await Vendor.create({ owner: admin._id, tenant: tenant._id, storeName: `${PLATFORM_NAME} Official`, slug: 'tatoz-official', description: `The official ${PLATFORM_NAME} demo storefront with a complete catalog and commerce lifecycle.`, contactEmail: admin.email, contactPhone: '+919810000000', status: 'active', approvedAt: new Date(), approvedBy: admin._id, commissionRate: 10, stats: { totalProducts: 0, activeProducts: 0 } });
  } else {
    vendor.tenant = tenant._id;
    vendor.status = 'active';
    vendor.approvedAt = vendor.approvedAt || new Date();
    vendor.approvedBy = vendor.approvedBy || admin._id;
    await vendor.save();
  }
  return vendor;
}

async function seedCatalog({ tenant, admin, vendor }) {
  const categories = new Map();
  for (const [index, definition] of CATEGORY_DEFS.entries()) {
    const doc = await Category.findOneAndUpdate(
      { slug: keyFor(definition.key) },
      { $set: { tenant: tenant._id, name: definition.name, description: `Explore the ${definition.name.toLowerCase()} collection in the ${PLATFORM_NAME} demo catalog.`, image: image(definition.image), isActive: true, order: index + 1, seo: { metaTitle: `${definition.name} | ${PLATFORM_NAME} Demo`, metaDescription: `Browse ${definition.name.toLowerCase()} with rich product details and live variants.`, keywords: [definition.name, PLATFORM_NAME] } } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    categories.set(definition.key, doc);
  }

  const brands = new Map();
  for (const [index, [name, description]] of BRAND_DEFS.entries()) {
    const doc = await Brand.findOneAndUpdate(
      { slug: keyFor(name) },
      { $set: { tenant: tenant._id, name, description, image: image(BRAND_IMAGES[index % BRAND_IMAGES.length]), isActive: true, order: index + 1, seo: { metaTitle: `${name} | ${PLATFORM_NAME} Demo Brands`, metaDescription: description, keywords: [name, PLATFORM_NAME] } } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    brands.set(name, doc);
  }

  const products = [];
  let productIndex = 0;
  for (const definition of CATEGORY_DEFS) {
    const categoryDoc = categories.get(definition.key);
    for (let index = 0; index < definition.products.length; index += 1) {
      const brandName = definition.brands[index];
      const brandDoc = brands.get(brandName);
      const payload = buildProduct({ category: definition, categoryDoc, brand: { name: brandName }, brandDoc, name: definition.products[index], productIndex, createdBy: admin._id, vendor: vendor._id });
      const product = await Product.findOneAndUpdate({ sku: payload.sku }, { $set: payload }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true });
      products.push(product);
      productIndex += 1;
    }
  }
  await Vendor.updateOne({ _id: vendor._id }, { $set: { 'stats.totalProducts': products.length, 'stats.activeProducts': products.length } });
  return { categories, brands, products };
}

async function seedBundles({ tenant, admin, vendor, categories, products }) {
  const byDemoName = new Map(products.map(product => [String(product.title).replace(/\s+— Demo Edition$/, ''), product]));
  const definitions = [
    {
      slug: 'demo-weekend-ready-combo',
      name: 'Weekend Ready Combo',
      offerType: 'fixed_combo',
      bundleType: 'fixed',
      category: 'bags',
      productNames: ['Transit Laptop Backpack', 'Everyday Canvas Tote', 'Nomad Weekend Duffel'],
      discountValue: 12,
      imageId: '1553062407-98eeb64c6a62',
      tags: ['travel', 'bags', 'fixed combo', 'demo'],
    },
    {
      slug: 'demo-home-refresh-kit',
      name: 'Home Refresh Kit',
      offerType: 'fixed_combo',
      bundleType: 'fixed',
      category: 'home',
      productNames: ['Arc Reading Lamp', 'Cloudrest Cushion Set', 'Craftstone Dinner Set'],
      discountValue: 15,
      imageId: '1556909114-f6e7ad7d3136',
      tags: ['home', 'living', 'combo', 'demo'],
    },
    {
      slug: 'demo-wellness-mix-match',
      name: 'Wellness Mix & Match Kit',
      offerType: 'mix_match',
      bundleType: 'mix_match',
      category: 'health',
      productNames: ['Daily Balance Vitamins', 'Calm Night Essential Oil', 'Hydrate Steel Bottle', 'Restore Massage Roller'],
      selectionRules: { minProducts: 2, maxProducts: 3, requiredQuantity: 2, maxQuantityPerProduct: 1 },
      discountValue: 10,
      imageId: '1556228720-195a672e8a03',
      tags: ['wellness', 'mix and match', 'custom bundle', 'demo'],
    },
    {
      slug: 'demo-buy-two-get-wellness-free',
      name: 'Buy Two Wellness Essentials, Get Calm Night Free',
      offerType: 'buy_x_get_y_free',
      bundleType: 'fixed',
      category: 'health',
      productNames: ['Daily Balance Vitamins', 'Hydrate Steel Bottle'],
      rewardProductName: 'Calm Night Essential Oil',
      discountValue: 8,
      imageId: '1556228720-195a672e8a03',
      tags: ['buy two get one', 'free reward', 'wellness', 'demo'],
    },
    {
      slug: 'demo-build-your-own-travel-kit',
      name: 'Build Your Own Travel Kit',
      offerType: 'custom_bundle',
      bundleType: 'custom',
      category: 'bags',
      productNames: ['Transit Laptop Backpack', 'Nomad Weekend Duffel', 'Everyday Canvas Tote', 'Summit Trek Pack'],
      selectionRules: { minProducts: 2, maxProducts: 2, requiredQuantity: 2, maxQuantityPerProduct: 1 },
      discountValue: 10,
      imageId: '1553062407-98eeb64c6a62',
      tags: ['build your own', 'custom bundle', 'travel', 'demo'],
    },
    {
      slug: 'demo-frequently-bought-tech',
      name: 'Frequently Bought Together Tech Set',
      offerType: 'frequently_bought_together',
      bundleType: 'fixed',
      category: 'electronics',
      productNames: ['Pulse Wireless Headphones', 'Orbit Smart Display', 'Beam Portable Speaker'],
      discountValue: 8,
      imageId: '1517336714731-489689fd1ca8',
      tags: ['frequently bought together', 'electronics', 'recommendation', 'demo'],
    },
  ];

  const bundles = [];
  for (const definition of definitions) {
    const componentProducts = definition.productNames.map(name => byDemoName.get(name)).filter(Boolean);
    if (componentProducts.length !== definition.productNames.length) {
      throw new Error(`Bundle seed products missing for ${definition.name}`);
    }
    const defaultVariantFor = product => Object.fromEntries((product.variants || []).map(variant => [variant.name, variant.options?.[0]?.value]).filter(([, value]) => value));
    const variantPriceFor = product => {
      const selectedValues = defaultVariantFor(product);
      const selectedOptions = (product.variants || []).map(variant => variant.options?.find(option => option.value === selectedValues[variant.name])).filter(Boolean);
      const pricedOption = [...selectedOptions].reverse().find(option => option.price !== undefined && option.price !== null);
      return Number(pricedOption?.price ?? product.price ?? 0);
    };
    const comparePrice = money(componentProducts.reduce((sum, product) => sum + variantPriceFor(product), 0));
    const price = money(comparePrice * (1 - definition.discountValue / 100));
    const components = componentProducts.map(product => ({
      product: product._id,
      quantity: 1,
      required: !['mix_match', 'custom_bundle'].includes(definition.offerType),
      group: ['mix_match', 'custom_bundle'].includes(definition.offerType) ? 'eligible-pool' : '',
      minQuantity: 1,
      maxQuantity: 1,
      defaultVariant: defaultVariantFor(product),
    }));
    const rewardProduct = definition.rewardProductName ? byDemoName.get(definition.rewardProductName) : null;
    if (definition.rewardProductName && !rewardProduct) throw new Error(`Bundle reward product missing for ${definition.name}`);
    const bundle = await Bundle.findOneAndUpdate(
      { tenant: tenant._id, slug: definition.slug },
      { $set: {
        tenant: tenant._id,
        name: definition.name,
        slug: definition.slug,
        sku: `DEMO-BUNDLE-${definition.slug.replace('demo-', '').replace(/-/g, '-').toUpperCase()}`,
        barcode: `890001${String(bundles.length + 1).padStart(6, '0')}`,
        bundleType: definition.bundleType,
        offerType: definition.offerType,
        description: `Save on a curated ${PLATFORM_NAME} demo ${definition.name.toLowerCase()} with real products, live stock, and server-authoritative bundle pricing.`,
        shortDescription: `${definition.name} with ${componentProducts.length} products and ${definition.discountValue}% demo bundle savings.`,
        components,
        price,
        comparePrice,
        discountType: 'percentage',
        discountValue: definition.discountValue,
        selectionRules: definition.selectionRules || { minProducts: 1, maxProducts: 100, requiredQuantity: 1, maxQuantityPerProduct: 100 },
        freeReward: rewardProduct ? { product: rewardProduct._id, quantity: 1, variant: Object.fromEntries((rewardProduct.variants || []).map(variant => [variant.name, variant.options?.[0]?.value]).filter(([, value]) => value)) } : { quantity: 1 },
        costPrice: money(componentProducts.reduce((sum, product) => sum + Number(product.costPrice || 0), 0) + Number(rewardProduct?.costPrice || 0)),
        hsnCode: '9403',
        gstRate: 18,
        image: image(definition.imageId),
        gallery: [{ url: image(definition.imageId), alt: `${definition.name} bundle image` }],
        tags: definition.tags,
        category: categories.get(definition.category)?._id,
        vendor: vendor._id,
        availability: { maxQuantityPerOrder: 5 },
        lifecycleStatus: 'active',
        isActive: true,
        seo: {
          metaTitle: `${definition.name} | ${PLATFORM_NAME} Demo Store`,
          metaDescription: `Shop the ${definition.name.toLowerCase()} with live products, transparent savings, and reliable delivery from ${PLATFORM_NAME}.`,
          keywords: [...definition.tags, `${PLATFORM_NAME} bundle`],
          canonical: `https://tatoz.com/bundles/${definition.slug}`,
          robots: 'index, follow',
        },
        createdBy: admin._id,
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    bundles.push(bundle);
  }
  return bundles;
}

async function seedCustomers({ tenant }) {
  const customers = [];
  for (const [index, [name, email, phone, city, state, pincode]] of CUSTOMER_NAMES.entries()) {
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ name, email, phone: `+91${phone}`, password: DEMO_PASSWORD, role: 'customer', isActive: true, isEmailVerified: true, isPhoneVerified: true });
      await user.save();
    } else {
      user.name = name;
      user.phone = user.phone || `+91${phone}`;
      user.isActive = true;
      user.isEmailVerified = true;
      user.isPhoneVerified = true;
      await user.save({ validateBeforeSave: false });
    }
    await TenantCustomer.findOneAndUpdate({ tenant: tenant._id, user: user._id }, { $set: { status: 'active', source: 'password', lastSeenAt: new Date() }, $setOnInsert: { firstSeenAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    customers.push({ user, address: { fullName: name, phone: `+91${phone}`, street: `${index + 12} Demo Market Road`, city, state, pincode, country: 'India' } });
  }
  return customers;
}

function productVariant(product, productIndex) {
  const first = product.variants?.[0];
  const second = product.variants?.[1];
  const firstOption = first?.options?.[productIndex % (first.options.length || 1)];
  const secondOption = second?.options?.[(productIndex + 1) % (second.options.length || 1)];
  return { [first?.name || 'Option']: firstOption?.value || 'Standard', [second?.name || 'Pack']: secondOption?.value || 'Single' };
}

async function seedOrders({ tenant, vendor, products, customers }) {
  const orders = [];
  for (let index = 0; index < 36; index += 1) {
    const customer = customers[index % customers.length];
    const firstProduct = products[(index * 7) % products.length];
    const secondProduct = products[(index * 7 + 13) % products.length];
    const quantity = (index % 5 === 0) ? 2 : 1;
    const items = [firstProduct, ...(index % 3 === 0 ? [secondProduct] : [])].map((product, itemIndex) => ({
      product: product._id,
      title: product.title,
      image: product.thumbnail,
      price: product.price,
      costPrice: product.costPrice,
      costPriceCaptured: true,
      quantity: itemIndex === 0 ? quantity : 1,
      variant: productVariant(product, index + itemIndex),
      sku: product.sku,
      hsnCode: product.hsnCode,
      taxRate: product.gstRate,
      taxableAmount: money(product.price * (itemIndex === 0 ? quantity : 1)),
      taxAmount: money(product.price * (itemIndex === 0 ? quantity : 1) * product.gstRate / 100),
    }));
    const subtotal = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const shippingCost = index % 4 === 0 ? 0 : 99;
    const taxableAmount = subtotal;
    const tax = money(taxableAmount * 0.18);
    const total = money(subtotal + shippingCost + tax);
    const orderStatus = ORDER_STATUSES[index % ORDER_STATUSES.length];
    const paymentMethod = ['cod', 'razorpay', 'cashfree', 'stripe'][index % 4];
    const paymentStatus = ['cancelled', 'pending'].includes(orderStatus) ? (orderStatus === 'cancelled' ? 'failed' : 'pending') : (['returned', 'refunded'].includes(orderStatus) ? 'refunded' : 'paid');
    const inventoryStatus = ['cancelled'].includes(orderStatus) ? 'released' : (['pending', 'confirmed', 'processing'].includes(orderStatus) ? 'reserved' : 'sold');
    const orderNumber = `DEMO-2026-${String(index + 1).padStart(4, '0')}`;
    const createdAt = new Date(now - (36 - index) * 86400000);
    const statusHistory = [
      { status: 'pending', note: 'Demo order created for storefront preview', updatedAt: createdAt },
      ...(orderStatus !== 'pending' ? [{ status: orderStatus, note: 'Demo lifecycle status', updatedAt: new Date(createdAt.getTime() + 3600000) }] : []),
    ];
    const lineTax = items.map((item, itemIndex) => ({ lineType: 'item', itemIndex, title: item.title, hsnCode: item.hsnCode, quantity: item.quantity, rate: item.taxRate, grossAmount: money(item.price * item.quantity), discountAmount: 0, taxableAmount: item.taxableAmount, cgst: money(item.taxAmount / 2), sgst: money(item.taxAmount / 2), igst: 0, otherTax: 0, tax: item.taxAmount }));
    const subOrderItems = items.map(item => ({ ...item.toObject ? item.toObject() : item }));
    const subOrder = { vendor: vendor._id, orderNumber: `${orderNumber}-V1`, items: subOrderItems, subtotal, shippingCost, tax, discount: 0, total, commissionRate: 10, commissionableAmount: subtotal, commissionAmount: money(subtotal * 0.1), vendorEarnings: money(subtotal * 0.9), status: orderStatus, statusHistory, paymentStatus, trackingNumber: `DEMO${String(700000 + index)}`, courierName: 'DemoShip Logistics' };
    const payload = {
      tenant: tenant._id,
      orderNumber,
      user: customer.user._id,
      items,
      shippingAddress: customer.address,
      paymentMethod,
      paymentStatus,
      paymentId: paymentStatus === 'paid' ? `demo_pay_${index + 1}` : '',
      paymentProviderOrderId: paymentMethod === 'cod' ? undefined : `demo_provider_order_${index + 1}`,
      paymentProvider: paymentMethod === 'cod' ? 'cod' : paymentMethod,
      paymentCurrency: 'INR',
      paymentVerifiedAt: paymentStatus === 'paid' ? new Date(createdAt.getTime() + 7200000) : undefined,
      orderStatus,
      returnStatus: orderStatus === 'returned' ? 'refunded' : 'none',
      subtotal,
      shippingCost,
      tax,
      taxableAmount,
      otherTax: tax,
      taxMode: 'exclusive',
      taxRegistrationType: 'unregistered',
      taxBreakdown: lineTax,
      discount: 0,
      total,
      inventoryStatus,
      shippingMethod: 'standard',
      shippingQuote: { zone: 'DEMO-ALL-INDIA', rate: shippingCost, provider: 'demo', promise: '3-5 business days' },
      subOrders: [subOrder],
      trackingNumber: `DEMO${String(700000 + index)}`,
      shippingProvider: 'demo',
      shippingStatus: orderStatus === 'delivered' ? 'delivered' : orderStatus === 'shipped' ? 'in_transit' : 'created',
      estimatedDelivery: new Date(createdAt.getTime() + 5 * 86400000),
      statusHistory,
      customerNote: 'Please leave the package at the front desk if nobody is home.',
      adminNote: 'Seeded demo order for operations dashboard preview.',
      checkoutIdempotencyKey: `demo-checkout-${index + 1}`,
      createdAt,
    };
    let order = await Order.findOne({ orderNumber });
    if (!order) order = new Order(payload);
    else Object.assign(order, payload);
    await order.save();
    orders.push(order);

    if (paymentMethod !== 'cod') {
      const attemptStatus = paymentStatus === 'paid' ? 'captured' : paymentStatus === 'failed' ? 'failed' : 'pending';
      const attempt = await PaymentAttempt.findOneAndUpdate({ order: order._id, provider: paymentMethod }, { $set: { tenant: tenant._id, amount: total, currency: 'INR', idempotencyKey: `demo-attempt-${index + 1}`, externalOrderId: `demo_provider_order_${index + 1}`, externalPaymentId: paymentStatus === 'paid' ? `demo_provider_payment_${index + 1}` : '', providerStatus: attemptStatus, status: attemptStatus, capturedAt: paymentStatus === 'paid' ? new Date() : undefined, metadata: { demo: true } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      const eventType = paymentStatus === 'paid' ? 'provider_captured' : paymentStatus === 'failed' ? 'provider_failed' : 'attempt_created';
      await PaymentTransaction.findOneAndUpdate({ tenant: tenant._id, provider: paymentMethod, idempotencyKey: `demo-payment-event-${index + 1}` }, { $set: { order: order._id, paymentAttempt: attempt._id, eventType, status: paymentStatus === 'failed' ? 'failed' : paymentStatus === 'paid' ? 'succeeded' : 'pending', amount: total, currency: 'INR', externalOrderId: `demo_provider_order_${index + 1}`, externalPaymentId: paymentStatus === 'paid' ? `demo_provider_payment_${index + 1}` : '', providerEventId: `demo-provider-event-${index + 1}`, source: paymentStatus === 'paid' ? 'webhook' : 'checkout', reason: 'Seeded demo payment lifecycle' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }

    if (!['cancelled', 'pending'].includes(orderStatus)) {
      const shipmentStatus = orderStatus === 'delivered' ? 'delivered' : orderStatus === 'out_for_delivery' ? 'out_for_delivery' : orderStatus === 'shipped' ? 'in_transit' : 'created';
      const shipment = await Shipment.findOneAndUpdate({ order: order._id, provider: 'demo' }, { $set: { tenant: tenant._id, idempotencyKey: `demo-shipment-${index + 1}`, status: shipmentStatus, externalOrderId: `demo_ship_order_${index + 1}`, externalShipmentId: `demo_ship_${index + 1}`, trackingNumber: `DEMO${String(700000 + index)}`, courierName: 'DemoShip Logistics', trackingUrl: `https://example.com/track/DEMO${String(700000 + index)}`, lastEventAt: new Date(), lastSyncedAt: new Date(), tracking: { demo: true, checkpoint: orderStatus }, raw: { demo: true }, createdBy: customer.user._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await ShipmentEvent.findOneAndUpdate({ tenant: tenant._id, shipment: shipment._id, eventKey: `demo-${shipmentStatus}` }, { $set: { order: order._id, provider: 'demo', providerEventId: `demo-shipment-event-${index + 1}`, status: shipmentStatus, description: `Demo shipment is ${shipmentStatus.replace(/_/g, ' ')}`, location: customer.address.city, eventAt: new Date(), source: 'system', raw: { demo: true } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }

    const invoiceType = paymentStatus === 'paid' ? 'tax_invoice' : 'proforma';
    const invoice = await ensureInvoiceForOrder({ order, tenant, documentType: invoiceType, source: 'admin' });
    if (invoice) {
      order.invoice = invoice._id;
      order.invoiceNumber = invoice.invoiceNumber;
      order.invoiceIssuedAt = invoice.issueDate;
      await order.save({ validateBeforeSave: false });
    }
  }
  return orders;
}

async function seedReviews({ tenant, products, customers, orders }) {
  let count = 0;
  for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
    for (let offset = 0; offset < 3; offset += 1) {
      const customer = customers[(productIndex + offset * 5) % customers.length];
      const order = orders.find(item => String(item.user) === String(customer.user._id) && item.items.some(line => String(line.product) === String(products[productIndex]._id)));
      const rating = 4 + ((productIndex + offset) % 2);
      await Review.findOneAndUpdate(
        { tenant: tenant._id, product: products[productIndex]._id, user: customer.user._id },
        { $set: { rating, title: REVIEW_TITLES[(productIndex + offset) % REVIEW_TITLES.length], comment: REVIEW_COMMENTS[(productIndex + offset) % REVIEW_COMMENTS.length], order: order?._id, isVerifiedPurchase: Boolean(order), verifiedAt: order ? new Date() : undefined, status: 'approved', helpful: (productIndex + offset) % 11, adminReply: offset === 0 ? 'Thank you for sharing your experience.' : '', adminReplyAt: offset === 0 ? new Date() : undefined } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      count += 1;
    }
    await Product.updateOne({ _id: products[productIndex]._id }, { $set: { 'ratings.average': 4.5, 'ratings.count': 3 } });
  }
  return count;
}

async function seedInventory({ tenant, products }) {
  for (const product of products) {
    await InventoryMovement.findOneAndUpdate(
      { idempotencyKey: `demo-restock-${product.sku}` },
      { $set: { tenant: tenant._id, product: product._id, type: 'restock', quantity: product.stock, variant: {}, variantKey: '', availableBefore: 0, availableAfter: product.stock, reservedBefore: 0, reservedAfter: 0, soldBefore: 0, soldAfter: 0, reason: `Initial ${PLATFORM_NAME} demo catalog stock` } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
}

async function seedMarketing({ tenant, admin, products, customers }) {
  const expiresAt = new Date(now + 180 * 86400000);
  await Coupon.findOneAndUpdate({ tenant: tenant._id, code: 'DEMO15' }, { $set: { description: `15% off the ${PLATFORM_NAME} demo catalog`, type: 'percentage', value: 15, maxDiscount: 1500, minOrderAmount: 999, usageLimit: 500, userLimit: 1, isActive: true, showOnCheckout: true, expiresAt, customerEligibility: 'all', allowedChannels: ['website', 'app'] } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await Coupon.findOneAndUpdate({ tenant: tenant._id, code: 'DEMOWELCOME' }, { $set: { description: 'Welcome offer for new demo customers', type: 'fixed', value: 250, minOrderAmount: 1499, usageLimit: 250, userLimit: 1, isActive: true, showOnCheckout: true, expiresAt, customerEligibility: 'new', isFirstOrderOnly: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const blogCategory = await BlogCategory.findOneAndUpdate({ slug: 'demo-journal' }, { $set: { tenant: tenant._id, name: 'Demo Journal', description: `Guides and stories from the ${PLATFORM_NAME} demo catalog.`, image: image('1499750310107-5fef28a66643'), isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const blogPosts = [
    ['How to build a better everyday edit', 'A practical guide to choosing products you will actually use.', '<h2>Choose for the life you live</h2><p>The best catalog is not the biggest one. Start with a clear need, compare the details, and choose quality that earns repeat use.</p><h3>Three simple filters</h3><ul><li>Look for materials and care details.</li><li>Check variants before adding to cart.</li><li>Use reviews to understand real-world fit.</li></ul>'],
    ['A visual guide to mindful gifting', 'Gift ideas with clear details, easy discovery, and a little personality.', '<h2>Gifts that feel considered</h2><p>A good gift balances usefulness and delight. Explore our demo collections by interest, price, and finish to find a thoughtful match.</p>'],
    ['From first click to front door', 'What a complete modern commerce journey should feel like.', `<h2>A smoother commerce journey</h2><p>Great shopping connects discovery, product detail, checkout, payment, fulfilment, and support into one clear flow. The ${PLATFORM_NAME} demo catalog makes each stage visible.</p>`],
  ];
  for (let index = 0; index < blogPosts.length; index += 1) {
    const [title, excerpt, content] = blogPosts[index];
    await Blog.findOneAndUpdate({ slug: keyFor(`blog-${index + 1}`) }, { $set: { tenant: tenant._id, title, excerpt, content, featuredImage: image(CATEGORY_DEFS[index].image), category: blogCategory._id, tags: ['demo', 'guide', PLATFORM_NAME], author: admin._id, status: 'published', publishedAt: new Date(now - index * 86400000), readTime: 4 + index, isFeatured: index === 0, allowComments: true, relatedProducts: products.slice(index * 4, index * 4 + 4).map(item => item._id), seo: { metaTitle: `${title} | ${PLATFORM_NAME} Journal`, metaDescription: excerpt, keywords: [PLATFORM_NAME, 'commerce', 'demo'] } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  for (let index = 0; index < Math.min(customers.length, 8); index += 1) {
    await Notification.findOneAndUpdate({ tenant: tenant._id, 'data.demoKey': `welcome-${index + 1}` }, { $set: { title: `Welcome to the ${PLATFORM_NAME} demo store`, message: `Hi ${customers[index].user.name}, explore live products, variants, reviews, orders, and rewards in the seeded demo experience.`, type: 'promo', target: 'specific', targetUsers: [customers[index].user._id], channels: { email: false, push: false, sms: false }, isRead: index % 3 === 0, sentAt: new Date(), status: 'sent', data: { demo: true, demoKey: `welcome-${index + 1}` } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
}

async function seedWalletLoyaltyGiftCards({ tenant, admin, customers }) {
  await TaxProfile.findOneAndUpdate({ tenant: tenant._id }, { $set: { enabled: true, registrationType: 'unregistered', pricingMode: 'exclusive', defaultRate: 18, originState: 'Maharashtra', businessName: `${PLATFORM_NAME} Demo Store`, invoicePrefix: 'TAT', shippingTaxable: false, invoiceNote: 'This is a seeded demo invoice.' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await LoyaltyProgram.findOneAndUpdate({ tenant: tenant._id }, { $set: { enabled: true, earnPointsPerCurrency: 1, redeemPointsPerCurrency: 100, minimumRedeemPoints: 100, maxRedeemPercent: 50, expiryDays: 365, updatedBy: admin._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  for (let index = 0; index < Math.min(customers.length, 12); index += 1) {
    const customer = customers[index];
    const cash = 250 + index * 75;
    const promotional = index % 2 === 0 ? 100 : 0;
    const wallet = await CustomerWallet.findOneAndUpdate({ tenant: tenant._id, user: customer.user._id }, { $set: { currency: 'INR', cashBalance: cash, promotionalBalance: promotional, status: 'active', lastTransactionAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const walletKey = `demo-wallet-credit-${index + 1}`;
    if (!await WalletTransaction.exists({ tenant: tenant._id, user: customer.user._id, idempotencyKey: walletKey })) {
      await WalletTransaction.create({ tenant: tenant._id, user: customer.user._id, wallet: wallet._id, direction: 'credit', bucket: 'cash', amount: cash, balanceAfter: cash + promotional, cashBalanceAfter: cash, promotionalBalanceAfter: promotional, source: 'manual', referenceType: 'demo_seed', referenceId: `customer-${index + 1}`, idempotencyKey: walletKey, note: 'Seeded demo wallet balance', createdBy: admin._id, remainingAmount: cash });
    }
    const points = 300 + index * 125;
    const account = await LoyaltyAccount.findOneAndUpdate({ tenant: tenant._id, user: customer.user._id }, { $set: { pointsBalance: points, lifetimeEarned: points, lifetimeRedeemed: 0, tier: points >= 1000 ? 'silver' : 'bronze', status: 'active', lastTransactionAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const loyaltyKey = `demo-loyalty-earn-${index + 1}`;
    if (!await LoyaltyTransaction.exists({ tenant: tenant._id, user: customer.user._id, idempotencyKey: loyaltyKey })) {
      await LoyaltyTransaction.create({ tenant: tenant._id, user: customer.user._id, account: account._id, direction: 'earn', points, balanceAfter: points, source: 'purchase', referenceType: 'demo_seed', referenceId: `customer-${index + 1}`, idempotencyKey: loyaltyKey, note: 'Seeded demo rewards balance', createdBy: admin._id, remainingPoints: points });
    }
  }
  const giftCode = 'DEMO-GIFT-2026-0001';
  const codeHash = crypto.createHash('sha256').update(giftCode).digest('hex');
  let giftCard = await GiftCard.findOne({ tenant: tenant._id, codeHash }).select('+codeHash');
  if (!giftCard) {
    giftCard = await GiftCard.create({ tenant: tenant._id, codeHash, codeLast4: giftCode.slice(-4), initialAmount: 2500, balance: 2500, currency: 'INR', status: 'active', expiresAt: new Date(now + 365 * 86400000), recipientName: customers[0].user.name, recipientEmail: customers[0].user.email, senderName: `${PLATFORM_NAME} Demo Team`, message: 'A seeded demo gift card for storefront testing.', createdBy: admin._id });
    await GiftCardTransaction.create({ tenant: tenant._id, giftCard: giftCard._id, direction: 'issue', amount: 2500, balanceBefore: 0, balanceAfter: 2500, source: 'issue', referenceType: 'demo_seed', referenceId: 'DEMO-GIFT-2026-0001', idempotencyKey: 'demo-gift-card-issue-1', note: 'Seeded demo gift card', createdBy: admin._id });
  }
  return { giftCard, giftCode }; // The full code is only logged as a local seed hint, never returned by public APIs.
}

async function seed() {
  await connectDB();
  const tenant = await ensureTenant();
  const admin = await ensureAdmin();
  const vendor = await ensureVendor({ tenant, admin });
  const { categories, brands, products } = await seedCatalog({ tenant, admin, vendor });
  const bundles = await seedBundles({ tenant, admin, vendor, categories, products });
  const customers = await seedCustomers({ tenant });
  const orders = await seedOrders({ tenant, vendor, products, customers });
  const reviews = await seedReviews({ tenant, products, customers, orders });
  await seedInventory({ tenant, products });
  await seedMarketing({ tenant, admin, products, customers });
  const walletData = await seedWalletLoyaltyGiftCards({ tenant, admin, customers });

  const counts = {};
  for (const [name, Model] of Object.entries({ Tenant, Category, Brand, Product, Bundle, User, TenantCustomer, Review, Order, PaymentAttempt, PaymentTransaction, Shipment, ShipmentEvent, Invoice, Coupon, Blog, BlogCategory, Notification, InventoryMovement, CustomerWallet, WalletTransaction, LoyaltyProgram, LoyaltyAccount, LoyaltyTransaction, GiftCard, GiftCardTransaction })) {
    counts[name] = await Model.countDocuments({});
  }
  console.log(JSON.stringify({
    success: true,
    mode: 'additive-idempotent-demo-seed',
    tenant: String(tenant._id),
    vendor: String(vendor._id),
    seeded: { categories: categories.size, brands: brands.size, products: products.length, bundles: bundles.length, customers: customers.length, orders: orders.length, reviews, walletCustomers: Math.min(customers.length, 12), loyaltyCustomers: Math.min(customers.length, 12), giftCards: 1, blogPosts: 3 },
    demoGiftCardLast4: walletData.giftCard.codeLast4,
    counts,
  }, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) {
  seed().catch(error => {
    console.error('Platform demo seed failed:', error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { seed };
