/* Demo store seed: 100 products (remote web images only, variants, bulk tiers,
 * beautiful HTML descriptions, full CRO) + categories, brands, users, vendors,
 * reviews, coupons, bundles, orders, invoices, ledger, payouts, inventory.
 * Images are remote Unsplash CDN URLs — nothing is downloaded to /uploads.
 * Every assigned image URL is live-checked before insert (fail fast on broken).
 * Usage: SEED_RESET=1 SEED_DB_CONFIRM=tatoz_db node scripts/seedDemoStore.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const slugify = require('slugify');

const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const VendorMember = require('../models/VendorMember');
const Review = require('../models/Review');
const Tenant = require('../models/Tenant');
const AuthPolicy = require('../models/AuthPolicy');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const Bundle = require('../models/Bundle');
const Invoice = require('../models/Invoice');
const VendorLedger = require('../models/VendorLedger');
const Payout = require('../models/Payout');
const InventoryMovement = require('../models/InventoryMovement');
const ClickEvent = require('../models/ClickEvent');

const MONGO_URI = process.env.MONGO_URI_SEED || process.env.MONGO_URI;
const IMAGE_POOLS = require('./seedFreshDummy.images.json');
const imgUrl = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;
const SEED_PREFIX = 'demo-store-2026';
const TENANT_DOMAINS = [
  { host: 'tatoz.com', verified: true, primary: true },
  { host: 'www.tatoz.com', verified: true, primary: false },
];

const CATEGORIES = [
  { slug: 'apparel', name: 'Apparel', description: 'Clothing for men, women and kids', order: 1 },
  { slug: 'footwear', name: 'Footwear', description: 'Shoes, sandals and sneakers', order: 2 },
  { slug: 'electronics', name: 'Electronics', description: 'Phones, laptops and gadgets', order: 3 },
  { slug: 'home-and-kitchen', name: 'Home & Kitchen', description: 'Furniture, decor and kitchen essentials', order: 4 },
  { slug: 'beauty', name: 'Beauty', description: 'Skincare, makeup and grooming', order: 5 },
  { slug: 'accessories', name: 'Accessories', description: 'Belts, scarves, sunglasses and more', order: 6 },
  { slug: 'bags-and-backpacks', name: 'Bags & Backpacks', description: 'Handbags, totes, backpacks and luggage', order: 7 },
  { slug: 'watches', name: 'Watches', description: 'Analog, digital and smartwatches', order: 8 },
  { slug: 'sports-and-outdoors', name: 'Sports & Outdoors', description: 'Fitness gear, camping and cycling', order: 9 },
  { slug: 'books', name: 'Books', description: 'Fiction, non-fiction and bestsellers', order: 10 },
  { slug: 'toys-and-games', name: 'Toys & Games', description: 'Building sets, board games and more', order: 11 },
  { slug: 'jewelry', name: 'Jewelry', description: 'Necklaces, earrings, rings and bracelets', order: 12 },
  { slug: 'health-and-personal-care', name: 'Health & Personal Care', description: 'Wellness, haircare and hygiene', order: 13 },
  { slug: 'pet-supplies', name: 'Pet Supplies', description: 'Food, toys and accessories for pets', order: 14 },
  { slug: 'office-supplies', name: 'Office Supplies', description: 'Stationery, notebooks and desk essentials', order: 15 },
];

const BRANDS = [
  'Nike', 'Adidas', 'Puma', 'Reebok', 'Samsung', 'Apple', 'Sony', 'LG',
  'Boat', 'Noise', 'IKEA', 'Cello', 'Zara', 'H&M', 'Levis', 'Lakme',
  'Maybelline', 'Loreal', 'Himalaya', 'Fossil', 'Casio', 'Timex',
  'Wildcraft', 'Lego', 'Penguin', 'Pedigree', 'Faber-Castell',
];

const CUSTOMERS = [
  ['Aarav Sharma', 'aarav.sharma@example.com', 'Mumbai', 'Maharashtra'],
  ['Priya Patel', 'priya.patel@example.com', 'Ahmedabad', 'Gujarat'],
  ['Rohan Mehta', 'rohan.mehta@example.com', 'Delhi', 'Delhi'],
  ['Sneha Iyer', 'sneha.iyer@example.com', 'Bengaluru', 'Karnataka'],
  ['Vikram Singh', 'vikram.singh@example.com', 'Jaipur', 'Rajasthan'],
  ['Ananya Das', 'ananya.das@example.com', 'Kolkata', 'West Bengal'],
  ['Kabir Malhotra', 'kabir.malhotra@example.com', 'Chandigarh', 'Punjab'],
  ['Divya Nair', 'divya.nair@example.com', 'Kochi', 'Kerala'],
  ['Arjun Reddy', 'arjun.reddy@example.com', 'Hyderabad', 'Telangana'],
  ['Ishita Bose', 'ishita.bose@example.com', 'Pune', 'Maharashtra'],
  ['Aditya Kumar', 'aditya.kumar@example.com', 'Lucknow', 'Uttar Pradesh'],
  ['Meera Joshi', 'meera.joshi@example.com', 'Surat', 'Gujarat'],
  ['Rahul Verma', 'rahul.verma@example.com', 'Indore', 'Madhya Pradesh'],
  ['Pooja Agarwal', 'pooja.agarwal@example.com', 'Kanpur', 'Uttar Pradesh'],
  ['Karan Chopra', 'karan.chopra@example.com', 'Amritsar', 'Punjab'],
];

const VENDOR_DEFS = [
  { name: 'Mumbai Mega Store', slug: 'mumbai-mega-store', email: 'store.mumbai@example.com', owner: 'Nikhil Shah' },
  { name: 'Delhi Daily Needs', slug: 'delhi-daily-needs', email: 'store.delhi@example.com', owner: 'Ritu Malhotra' },
  { name: 'Bengaluru Boutique', slug: 'bengaluru-boutique', email: 'store.bengaluru@example.com', owner: 'Farhan Khan' },
];

// [title, categorySlug, brand, basePrice, variantName, optionValues, tags]
const PRODUCTS = [
  ['Dri-FIT Running T-Shirt', 'apparel', 'Nike', 1999, 'Size', ['S', 'M', 'L', 'XL'], ['running', 'sportswear', 'mesh']],
  ['3-Stripe Cotton Tee', 'apparel', 'Adidas', 2499, 'Size', ['S', 'M', 'L', 'XL'], ['cotton', 'casual', 'unisex']],
  ['511 Slim Fit Jeans', 'apparel', 'Levis', 3999, 'Waist', ['30', '32', '34', '36'], ['denim', 'jeans', 'slim']],
  ['Slim Fit Blazer', 'apparel', 'Zara', 2999, 'Size', ['38', '40', '42'], ['blazer', 'formal', 'office']],
  ['Oversized Knit Sweater', 'apparel', 'H&M', 1899, 'Size', ['S', 'M', 'L'], ['knit', 'cozy', 'winter']],
  ['Windrunner Jacket', 'apparel', 'Nike', 2799, 'Size', ['M', 'L', 'XL'], ['jacket', 'wind', 'running']],
  ['Essentials Hoodie', 'apparel', 'Puma', 1799, 'Color', ['Black', 'Grey', 'Navy'], ['hoodie', 'fleece', 'casual']],
  ['Pleated Midi Skirt', 'apparel', 'Zara', 2299, 'Size', ['S', 'M', 'L'], ['skirt', 'midi', 'formal']],
  ['501 Original Jeans', 'apparel', 'Levis', 4299, 'Waist', ['30', '32', '34'], ['denim', 'classic', 'jeans']],
  ['Tech Fleece Hoodie', 'apparel', 'Nike', 4499, 'Size', ['M', 'L', 'XL'], ['fleece', 'hoodie', 'tech']],
  ['Air Zoom Pegasus 40', 'footwear', 'Nike', 5999, 'Size', ['UK 7', 'UK 8', 'UK 9', 'UK 10'], ['running', 'cushioned']],
  ['Ultraboost 23', 'footwear', 'Adidas', 5499, 'Size', ['UK 7', 'UK 8', 'UK 9'], ['running', 'boost', 'premium']],
  ['Suede Classic XXI', 'footwear', 'Puma', 3499, 'Size', ['UK 6', 'UK 7', 'UK 8', 'UK 9'], ['suede', 'lifestyle']],
  ['Classic Leather', 'footwear', 'Reebok', 2999, 'Size', ['UK 7', 'UK 8', 'UK 9'], ['leather', 'lifestyle']],
  ['Air Force 1 07', 'footwear', 'Nike', 6999, 'Size', ['UK 8', 'UK 9', 'UK 10'], ['lifestyle', 'iconic']],
  ['Stan Smith', 'footwear', 'Adidas', 4499, 'Size', ['UK 6', 'UK 7', 'UK 8'], ['tennis', 'classic']],
  ['Clyde Court Lo', 'footwear', 'Puma', 2799, 'Size', ['UK 7', 'UK 8', 'UK 9'], ['basketball', 'lifestyle']],
  ['Zig Kinetica 2.5', 'footwear', 'Reebok', 3999, 'Size', ['UK 8', 'UK 9', 'UK 10'], ['zig', 'running']],
  ['Galaxy A55 5G', 'electronics', 'Samsung', 34999, 'Storage', ['128 GB', '256 GB'], ['phone', '5g', 'android']],
  ['iPhone 15', 'electronics', 'Apple', 79900, 'Storage', ['128 GB', '256 GB', '512 GB'], ['iphone', 'premium']],
  ['WH-1000XM5 Headphones', 'electronics', 'Sony', 12990, 'Color', ['Black', 'Silver'], ['anc', 'wireless', 'over-ear']],
  ['MacBook Air M3', 'electronics', 'Apple', 49900, 'Storage', ['256 GB', '512 GB'], ['laptop', 'ultrathin']],
  ['Galaxy Buds2 Pro', 'electronics', 'Samsung', 22990, 'Color', ['Graphite', 'White', 'Violet'], ['earbuds', 'wireless']],
  ['27in 4K UltraGear Monitor', 'electronics', 'LG', 18990, 'Size', ['27 inch', '32 inch'], ['monitor', '4k', 'gaming']],
  ['Bravia 50in 4K Smart TV', 'electronics', 'Sony', 54990, 'Size', ['50 inch', '55 inch'], ['tv', '4k', 'smart']],
  ['iPad Air 11', 'electronics', 'Apple', 24900, 'Storage', ['64 GB', '256 GB'], ['tablet']],
  ['Airdopes Atom 81', 'electronics', 'Boat', 1999, 'Color', ['Black', 'White', 'Blue'], ['earbuds', 'budget']],
  ['HT-S20R 5.1 Soundbar', 'electronics', 'Sony', 7990, 'Version', ['Standard', 'Dolby Audio'], ['soundbar', '5.1']],
  ['ColorFit Pulse 2 Max', 'electronics', 'Noise', 1999, 'Strap', ['Black', 'Blue', 'Green'], ['smartwatch', 'budget']],
  ['43in Crystal 4K TV', 'electronics', 'Samsung', 28990, 'Size', ['43 inch', '50 inch'], ['tv', 'uhd']],
  ['Watch Series 9', 'electronics', 'Apple', 19900, 'Size', ['41 mm', '45 mm'], ['smartwatch', 'health']],
  ['BILLY Bookcase', 'home-and-kitchen', 'IKEA', 12990, 'Finish', ['White', 'Oak'], ['bookcase', 'storage']],
  ['KIVIK 3-Seater Sofa', 'home-and-kitchen', 'IKEA', 15990, 'Color', ['Grey', 'Beige', 'Blue'], ['sofa', 'living']],
  ['Dinnerware Set 16-Piece', 'home-and-kitchen', 'Cello', 1990, 'Color', ['White', 'Ivory'], ['dinnerware', 'ceramic']],
  ['Pressure Cooker 5L', 'home-and-kitchen', 'Cello', 3490, 'Capacity', ['3 L', '5 L', '7.5 L'], ['cooker', 'kitchen']],
  ['FADO Table Lamp', 'home-and-kitchen', 'IKEA', 4990, 'Color', ['White', 'Grey'], ['lamp', 'lighting']],
  ['Non-Stick Cookware Set', 'home-and-kitchen', 'Cello', 2490, 'Pieces', ['5-piece', '7-piece', '10-piece'], ['cookware', 'non-stick']],
  ['POANG Armchair', 'home-and-kitchen', 'IKEA', 3990, 'Finish', ['Oak', 'Black', 'White'], ['armchair', 'living']],
  ['Mixing Grinder 750W', 'home-and-kitchen', 'Cello', 3990, 'Jars', ['3 jars', '4 jars', '5 jars'], ['grinder', 'kitchen']],
  ['Absolute Skin Gloss Foundation', 'beauty', 'Lakme', 650, 'Shade', ['Ivory', 'Beige', 'Honey'], ['foundation', 'makeup']],
  ['Fit Me Matte Foundation', 'beauty', 'Maybelline', 549, 'Shade', ['Light', 'Medium', 'Deep'], ['foundation', 'matte']],
  ['Total Repair 5 Shampoo', 'beauty', 'Loreal', 899, 'Size', ['340 ml', '650 ml'], ['shampoo', 'haircare']],
  ['Lash Sensational Mascara', 'beauty', 'Maybelline', 699, 'Color', ['Black', 'Brown'], ['mascara', 'eye']],
  ['Hyaluronic Acid Serum', 'beauty', 'Loreal', 1099, 'Size', ['30 ml', '50 ml'], ['serum', 'skincare']],
  ['Eyeconic Kajal Pencil', 'beauty', 'Lakme', 449, 'Pack', ['Pack of 1', 'Pack of 2', 'Pack of 3'], ['kajal', 'eye']],
  ['ColorSensational Lipstick', 'beauty', 'Maybelline', 399, 'Shade', ['Red', 'Pink', 'Nude', 'Maroon'], ['lipstick', 'color']],
  ['Sun Expert SPF 50 Sunscreen', 'beauty', 'Lakme', 999, 'Size', ['50 ml', '100 ml'], ['sunscreen', 'spf']],
  ['Leather Belt', 'accessories', 'Fossil', 1799, 'Size', ['30', '32', '34', '36'], ['belt', 'leather']],
  ['Aviator Sunglasses', 'accessories', 'Fossil', 1299, 'Color', ['Gold', 'Black', 'Silver'], ['sunglasses', 'uv']],
  ['Canvas Wallet', 'accessories', 'Fossil', 1499, 'Color', ['Brown', 'Black', 'Tan'], ['wallet', 'casual']],
  ['Cotton Scarf', 'accessories', 'Zara', 999, 'Color', ['Beige', 'Grey', 'Maroon'], ['scarf', 'winter']],
  ['Knit Beanie', 'accessories', 'H&M', 899, 'Color', ['Grey', 'Black', 'Maroon'], ['beanie', 'winter']],
  ['Trekking Backpack 45L', 'bags-and-backpacks', 'Wildcraft', 1999, 'Capacity', ['35 L', '45 L', '60 L'], ['trekking', 'travel']],
  ['Laptop Backpack', 'bags-and-backpacks', 'Wildcraft', 1299, 'Size', ['15 inch', '17 inch'], ['laptop', 'commute']],
  ['Leather Tote', 'bags-and-backpacks', 'Fossil', 5499, 'Color', ['Tan', 'Black', 'Brown'], ['tote', 'leather']],
  ['Duffel Bag 50L', 'bags-and-backpacks', 'Wildcraft', 2499, 'Capacity', ['40 L', '50 L', '65 L'], ['duffel', 'travel']],
  ['Gen 6 Crossbody', 'bags-and-backpacks', 'Fossil', 3999, 'Color', ['Black', 'Brown'], ['crossbody', 'leather']],
  ['G-Shock GA-2100', 'watches', 'Casio', 1499, 'Color', ['Black', 'Red', 'White'], ['g-shock', 'rugged']],
  ['Vintage A158', 'watches', 'Casio', 999, 'Color', ['Gold', 'Silver'], ['vintage', 'digital']],
  ['Grant Chronograph', 'watches', 'Fossil', 5499, 'Strap', ['Leather', 'Steel'], ['chronograph', 'leather']],
  ['Waterbury Traditional', 'watches', 'Timex', 2499, 'Strap', ['Brown Leather', 'Black Leather'], ['analog', 'classic']],
  ['Edifice EFR-S108D', 'watches', 'Casio', 4499, 'Color', ['Black', 'Silver', 'Blue'], ['chronograph', 'steel']],
  ['Pulse 2 Max Smartwatch', 'watches', 'Noise', 1599, 'Strap', ['Black', 'Blue', 'Green'], ['smartwatch', 'amoled']],
  ['Football Size 5', 'sports-and-outdoors', 'Nike', 1499, 'Size', ['Size 4', 'Size 5'], ['football', 'training']],
  ['Yoga Mat 6mm', 'sports-and-outdoors', 'Adidas', 2999, 'Thickness', ['4 mm', '6 mm', '8 mm'], ['yoga', 'mat']],
  ['2-Person Camping Tent', 'sports-and-outdoors', 'Wildcraft', 4999, 'Capacity', ['2 person', '3 person', '4 person'], ['camping', 'tent']],
  ['Resistance Band Set', 'sports-and-outdoors', 'Nike', 1999, 'Level', ['Light', 'Medium', 'Heavy'], ['resistance', 'fitness']],
  ['Cycling Gloves', 'sports-and-outdoors', 'Adidas', 1299, 'Size', ['S', 'M', 'L'], ['cycling', 'gloves']],
  ['Speed Rope Pro', 'sports-and-outdoors', 'Reebok', 4499, 'Style', ['Standard', 'Weighted'], ['rope', 'cardio']],
  ['Sleeping Bag Trek', 'sports-and-outdoors', 'Wildcraft', 1799, 'Rating', ['5C comfort', '0C comfort', '-5C comfort'], ['camping', 'sleep']],
  ['Running Belt', 'sports-and-outdoors', 'Puma', 2199, 'Size', ['S-M', 'L-XL'], ['running', 'belt']],
  ['The Alchemist', 'books', 'Penguin', 399, 'Format', ['Paperback', 'Hardcover'], ['fiction', 'classic']],
  ['Sapiens', 'books', 'Penguin', 499, 'Format', ['Paperback', 'Hardcover'], ['history', 'nonfiction']],
  ['Ikigai', 'books', 'Penguin', 350, 'Format', ['Paperback', 'Hardcover'], ['self-help', 'philosophy']],
  ['Atomic Habits', 'books', 'Penguin', 599, 'Format', ['Paperback', 'Hardcover'], ['habits', 'productivity']],
  ['1984', 'books', 'Penguin', 450, 'Format', ['Paperback', 'Hardcover'], ['dystopian', 'classic']],
  ['To Kill a Mockingbird', 'books', 'Penguin', 550, 'Format', ['Paperback', 'Hardcover'], ['classic', 'fiction']],
  ['Classic Bricks 484-Piece Set', 'toys-and-games', 'Lego', 1499, 'Pieces', ['484 pieces', '790 pieces', '1500 pieces'], ['lego', 'building']],
  ['City Police Station', 'toys-and-games', 'Lego', 2999, 'Edition', ['Standard', 'Deluxe'], ['city', 'police']],
  ['Technic Porsche 911', 'toys-and-games', 'Lego', 4499, 'Edition', ['Standard', 'Collectors'], ['technic', 'model']],
  ['Creator 3-in-1 Space Astronaut', 'toys-and-games', 'Lego', 1999, 'Edition', ['Standard', 'Deluxe'], ['creator', 'space']],
  ['Duplo Number Train', 'toys-and-games', 'Lego', 999, 'Set', ['Basic', 'Deluxe'], ['duplo', 'toddler']],
  ['Friends Heartlake Bakery', 'toys-and-games', 'Lego', 1299, 'Set', ['Basic', 'Deluxe'], ['friends', 'baking']],
  ['Vintage Pendant Necklace', 'jewelry', 'Fossil', 1999, 'Material', ['Silver', 'Gold-plated'], ['necklace', 'vintage']],
  ['Tear Drop Earrings', 'jewelry', 'Fossil', 1499, 'Material', ['Silver', 'Rose-gold'], ['earrings', 'silver']],
  ['Stackable Ring Set', 'jewelry', 'Fossil', 2499, 'Size', ['12', '14', '16'], ['rings', 'stackable']],
  ['Beaded Bracelet', 'jewelry', 'Fossil', 1799, 'Size', ['S', 'M', 'L'], ['bracelet', 'beaded']],
  ['Castor Oil 100ml', 'health-and-personal-care', 'Himalaya', 499, 'Size', ['100 ml', '200 ml'], ['oil', 'haircare']],
  ['Cleansing Milk', 'health-and-personal-care', 'Himalaya', 299, 'Size', ['100 ml', '200 ml'], ['cleanser', 'skincare']],
  ['Face Wash Oily Skin', 'health-and-personal-care', 'Lakme', 549, 'Size', ['100 g', '150 g'], ['facewash', 'oil']],
  ['Hair Spa Mask', 'health-and-personal-care', 'Himalaya', 449, 'Size', ['200 g', '400 g'], ['mask', 'haircare']],
  ['Reflective Dog Leash', 'pet-supplies', 'Pedigree', 999, 'Size', ['S', 'M', 'L'], ['dog', 'leash']],
  ['Pet Travel Bowl', 'pet-supplies', 'Pedigree', 1499, 'Size', ['Small', 'Large'], ['dog', 'bowl']],
  ['Cat Toy Ball', 'pet-supplies', 'Cello', 599, 'Pack', ['Pack of 2', 'Pack of 4', 'Pack of 6'], ['cat', 'toy']],
  ['Pet Carrier Backpack', 'pet-supplies', 'Wildcraft', 1999, 'Size', ['S', 'M'], ['cat', 'carrier']],
  ['48 Color Pencil Set', 'office-supplies', 'Faber-Castell', 299, 'Pack', ['24 colors', '48 colors', '72 colors'], ['colored', 'art']],
  ['Goldfaber Sketch Pen', 'office-supplies', 'Faber-Castell', 199, 'Pack', ['Pack of 4', 'Pack of 8'], ['sketch', 'ink']],
  ['A4 Notebook Hardcover', 'office-supplies', 'Faber-Castell', 499, 'Pack', ['Pack of 1', 'Pack of 3', 'Pack of 5'], ['notebook', 'a4']],
  ['Drafting Pencil Set', 'office-supplies', 'Faber-Castell', 599, 'Pack', ['Set of 3', 'Set of 6'], ['drafting', 'pencil']],
  ['Highlighter Pack 10', 'office-supplies', 'Faber-Castell', 249, 'Pack', ['6 colors', '10 colors', '20 colors'], ['highlighter', 'office']],
];

const COUPONS = [
  { code: 'WELCOME10', description: '10% off your first order', type: 'percentage', value: 10, maxDiscount: 500, minOrderAmount: 499, isFirstOrderOnly: true, customerEligibility: 'new', showOnCheckout: true, expiresInDays: 90, usageLimit: 10000 },
  { code: 'FLAT200', description: 'Flat Rs 200 off above Rs 1499', type: 'fixed', value: 200, minOrderAmount: 1499, showOnCheckout: true, expiresInDays: 60, usageLimit: 5000 },
  { code: 'FREESHIP', description: 'Free shipping above Rs 499', type: 'free_shipping', value: 0, minOrderAmount: 499, showOnCheckout: true, expiresInDays: 60, usageLimit: 20000 },
  { code: 'FESTIVE15', description: '15% festive discount up to Rs 1500', type: 'percentage', value: 15, maxDiscount: 1500, minOrderAmount: 999, showOnCheckout: true, expiresInDays: 45, usageLimit: 8000 },
  { code: 'B2B5', description: '5% off for repeat buyers', type: 'percentage', value: 5, maxDiscount: 2000, customerEligibility: 'existing', expiresInDays: 120, usageLimit: 3000 },
  { code: 'BUY2GET1', description: 'Buy 2 get 1 free (lowest priced item)', type: 'buy_x_get_y', buyXGetY: { buyQuantity: 2, getQuantity: 1, getDiscount: 100 }, expiresInDays: 30, usageLimit: 2000 },
  { code: 'COMBO20', description: '20% off combo packs', type: 'bundle', bundleDiscount: 20, expiresInDays: 45, usageLimit: 2000 },
  { code: 'BIGSAVE25', description: 'Up to 25% off on bulk quantity', type: 'tiered', tiers: [{ minQuantity: 2, discount: 10 }, { minQuantity: 4, discount: 18 }, { minQuantity: 6, discount: 25 }], expiresInDays: 30, usageLimit: 1500 },
];

// [name, bundleType, [product titles], tags]
const BUNDLES = [
  ['Grooming Essentials Combo', 'fixed', ['Total Repair 5 Shampoo', 'Face Wash Oily Skin', 'Eyeconic Kajal Pencil'], ['grooming', 'combo']],
  ['Home Starter Kit', 'fixed', ['FADO Table Lamp', 'Non-Stick Cookware Set', 'Dinnerware Set 16-Piece'], ['home', 'combo']],
  ['Fitness Starter Pack', 'fixed', ['Resistance Band Set', 'Speed Rope Pro', 'Yoga Mat 6mm'], ['fitness', 'combo']],
  ['Denim Duo Pack', 'multipack', ['511 Slim Fit Jeans', '501 Original Jeans'], ['denim', 'pack']],
  ['Audio Value Pack', 'fixed', ['WH-1000XM5 Headphones', 'Airdopes Atom 81'], ['audio', 'pack']],
  ['Office Study Kit', 'fixed', ['48 Color Pencil Set', 'A4 Notebook Hardcover', 'Highlighter Pack 10'], ['office', 'kit']],
];

const REVIEW_TITLES = [
  'Great value for money', 'Exceeded expectations', 'Good quality', 'Highly recommended',
  'Does the job well', 'Premium feel', 'Solid purchase', 'Worth every rupee',
  'Impressive packaging', 'Genuine product', 'Loved it', 'Five stars from me',
  'Better than expected', 'Quality is top notch', 'Perfect for daily use', 'Must buy',
];
const REVIEW_COMMENTS = [
  'Build quality is excellent and it looks even better in person. Delivery was quick and packaging was secure.',
  'Using it for two weeks now and it works flawlessly. Genuine product with proper billing and warranty.',
  'Good finish and accurate description. The size and fit are exactly as mentioned on the page.',
  'Value for money at this price. Material feels durable and the color matches the photos.',
  'Ordered on Monday, delivered by Thursday. Installation and setup took only a few minutes.',
  'My second purchase from this brand and the consistency in quality is impressive.',
  'Does exactly what it promises. Customer support helped me pick the right variant before ordering.',
  'Premium packaging, no damage in transit. Product performance has been reliable so far.',
  'Compared with three other options before buying this one — glad I picked it. Highly recommended.',
  'Fits perfectly and the finish is clean with no rough edges. Will definitely buy again.',
  'Gifted this to my brother and he loved it. Looks premium and works without any issues.',
  'Battery and performance are solid. The product page description turned out to be accurate.',
  'Good grip and comfortable to use for long hours. Quality matches the price point.',
  'Authentic product with sealed packing. The variant I chose matches the images exactly.',
  'Easy returns process gave me confidence to order, but I did not need it — product is great.',
  'Sturdy construction and thoughtful design. It has held up well to daily use.',
];

const CRO_PROMOS = [
  'Bestseller in its category this month', 'Limited launch pricing ends soon',
  'Top rated by verified buyers', 'Festive season special pricing',
  'Almost gone — restock takes weeks', 'Back in stock after heavy demand',
  'Staff pick for quality and value', 'Over 10,000 happy customers',
  'New and improved 2026 edition', 'Bundle it with essentials and save more',
];
const CRO_REASONS = [
  'Genuine brand product with GST invoice', '7-day easy replacement promise',
  'Quality checked before dispatch', 'Ships in 24 hours from nearest warehouse',
  'Best price guarantee on this variant', 'Secure payments with full buyer protection',
];
const CRO_BENEFITS = [
  'Built for everyday Indian use conditions', 'Low maintenance and long service life',
  'Compatible with standard accessories', 'Energy and cost efficient by design',
  'Compact footprint, easy to store', 'Premium finish that ages gracefully',
];
const CRO_FAQ_A = [
  'Is this a genuine brand product with warranty?',
  'How fast is delivery to my pincode?',
  'What is the return and replacement policy?',
  'How do I pick the right variant for my needs?',
];
const CRO_FAQ_Q2A = [
  'Yes. Every unit is 100% genuine, ships with a GST invoice, and carries the standard brand warranty where applicable.',
  'Most pincodes are served in 2-4 working days. Metro cities usually receive orders within 48 hours of dispatch.',
  'Unused items in original packing are eligible for a 7-day easy replacement. Refunds follow the standard policy.',
  'Check the variant guide on this page or message support with your requirement — we reply within a few hours.',
];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const daysAgo = (n) => new Date(Date.now() - n * 864e5);
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function buildSpecs(catSlug) {
  const table = {
    apparel: [['Material', 'Premium cotton blend'], ['Fit', 'Regular fit'], ['Care', 'Machine wash cold'], ['Occasion', 'Casual and daily wear']],
    footwear: [['Upper', 'Engineered mesh and synthetic'], ['Sole', 'Anti-skid rubber outsole'], ['Closure', 'Lace-up'], ['Use', 'Daily wear and training']],
    electronics: [['Warranty', '1 year brand warranty'], ['In the box', 'Device, cable, manual'], ['Power', 'Standard Indian voltage'], ['Support', 'Pan-India service network']],
    'home-and-kitchen': [['Material', 'High-grade engineered finish'], ['Assembly', 'DIY with manual included'], ['Care', 'Wipe with dry cloth'], ['Use', 'Indoor home use']],
    beauty: [['Skin type', 'All skin types'], ['Finish', 'Natural finish'], ['Shelf life', '24 months from mfg'], ['Use', 'External use only']],
    accessories: [['Material', 'Premium grade finish'], ['Care', 'Wipe clean'], ['Fit', 'Adjustable comfort fit'], ['Package', 'Single unit with box']],
    'bags-and-backpacks': [['Material', 'Water-repellent polyester'], ['Capacity', 'As per variant'], ['Compartments', 'Multi-pocket layout'], ['Care', 'Spot clean only']],
    watches: [['Movement', 'Precision quartz'], ['Strap', 'As per variant'], ['Water resistance', 'Splash resistant'], ['Warranty', '1 year brand warranty']],
    'sports-and-outdoors': [['Material', 'High-durability build'], ['Use', 'Training and outdoor'], ['Care', 'Clean after use'], ['Level', 'Beginner to advanced']],
    books: [['Publisher', 'Standard edition'], ['Language', 'English'], ['Pages', 'Standard print'], ['Binding', 'As per variant']],
    'toys-and-games': [['Age', '6+ years'], ['Pieces', 'As per variant'], ['Material', 'Child-safe ABS'], ['Skills', 'Creativity and motor skills']],
    jewelry: [['Plating', 'Skin-safe plating'], ['Care', 'Keep away from perfume'], ['Package', 'Gift-ready box'], ['Occasion', 'Daily and festive wear']],
    'health-and-personal-care': [['Use', 'As directed on pack'], ['Shelf life', '24 months from mfg'], ['Storage', 'Cool dry place'], ['Caution', 'Discontinue if irritation occurs']],
    'pet-supplies': [['Pet', 'As per variant'], ['Material', 'Pet-safe materials'], ['Care', 'Wash regularly'], ['Use', 'Daily pet care']],
    'office-supplies': [['Pack', 'As per variant'], ['Use', 'School and office'], ['Quality', 'Smooth consistent output'], ['Storage', 'Store flat in dry place']],
  };
  return (table[catSlug] || table.apparel).map(([key, value]) => ({ key, value }));
}

function buildCro(title, brand) {
  const socialCount = randInt(120, 2400);
  const soldCount = randInt(300, 9000);
  const visitorCount = randInt(40, 400);
  const stockVal = randInt(8, 60);
  return {
    promotionalMessage: pick(CRO_PROMOS),
    customRating: {
      enabled: true,
      value: Math.round((randInt(42, 49) / 10) * 10) / 10,
      reviewCount: randInt(50, 2500),
      summary: `${brand} ${title} rated by verified buyers`,
    },
    reasonsTitle: 'Why buyers love it',
    reasonsToBuy: shuffled(CRO_REASONS).slice(0, 4),
    socialProof: {
      enabled: true, period: '7d', count: socialCount,
      min: Math.max(10, socialCount - 200), max: socialCount + 300,
      customLabel: 'shoppers bought this this week',
    },
    stockDisplay: {
      enabled: true, value: stockVal,
      min: Math.max(2, stockVal - 5), max: stockVal + 10,
    },
    soldDisplay: {
      enabled: true, count: soldCount,
      min: Math.max(50, soldCount - 500), max: soldCount + 800,
      label: 'sold recently',
    },
    visitorDisplay: {
      enabled: true, count: visitorCount,
      min: Math.max(5, visitorCount - 30), max: visitorCount + 60,
    },
    etaText: `Delivery in ${randInt(2, 4)}-${randInt(4, 6)} days`,
    benefits: shuffled(CRO_BENEFITS).slice(0, 4),
    testimonialReviews: shuffled(CUSTOMERS.map(c => c[0].split(' ')[0])).slice(0, 3).map((n) => ({
      name: n, rating: pick([4, 4, 5, 5, 5]),
      text: pick(REVIEW_COMMENTS).slice(0, 200),
      location: pick(['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Jaipur', 'Kolkata']),
      verified: true,
    })),
    faqs: CRO_FAQ_A.map((q, i) => ({ question: q, answer: CRO_FAQ_Q2A[i] })),
  };
}

function buildBulkTiers(basePrice) {
  const off = (pct) => Math.max(1, Math.round(basePrice * (1 - pct / 100)));
  return [
    { minQuantity: 10, price: off(5), label: 'Buy 10+ save 5%' },
    { minQuantity: 25, price: off(8), label: 'Buy 25+ save 8%' },
    { minQuantity: 50, price: off(12), label: 'Buy 50+ save 12%' },
  ];
}

// Rich storefront HTML: hero banner, highlights, feature grid, spec table,
// variant guide, bulk strip, delivery strip. Inline styles only.
function buildDescription({ title, brand, catName, tags, variantName, options, specifications, price, comparePrice, rating }) {
  const t = escapeHtml(title);
  const b = escapeHtml(brand);
  const c = escapeHtml(catName);
  const tagLine = tags.map(escapeHtml).join(' • ');
  const rows = specifications.map(({ key, value }) =>
    `<tr><td style="padding:10px 14px;border:1px solid #eee;background:#fafafa;font-weight:600;width:32%;">${escapeHtml(key)}</td><td style="padding:10px 14px;border:1px solid #eee;">${escapeHtml(value)}</td></tr>`).join('');
  const chips = options.map(o =>
    `<span style="display:inline-block;margin:4px 6px 0 0;padding:7px 16px;border:1.5px solid #4f46e5;border-radius:999px;font-size:13px;font-weight:600;color:#4338ca;background:#eef2ff;">${escapeHtml(o)}</span>`).join('');
  const feats = shuffled(CRO_BENEFITS).slice(0, 4).map(f =>
    `<div style="flex:1 1 200px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;"><div style="font-size:20px;">✔</div><div style="font-weight:700;margin:6px 0 4px;font-size:14px;">${escapeHtml(f.split(' ').slice(0, 3).join(' '))}</div><div style="font-size:13px;color:#475569;">${escapeHtml(f)}</div></div>`).join('');
  const save = comparePrice && comparePrice > price
    ? `<span style="background:#dcfce7;color:#15803d;font-weight:800;padding:4px 12px;border-radius:999px;font-size:13px;">SAVE ${Math.round((comparePrice - price) / comparePrice * 100)}%</span>` : '';
  return [
    '<div class="product-description" style="font-family:system-ui,-apple-system,sans-serif;color:#1e293b;line-height:1.7;max-width:860px;">',
    `<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed 55%,#db2777);border-radius:16px;padding:28px 26px;color:#fff;margin-bottom:22px;"><div style="font-size:12px;letter-spacing:2px;opacity:.85;">${c.toUpperCase()} • ${b.toUpperCase()}</div><h2 style="margin:8px 0 6px;font-size:26px;">${t}</h2><div style="font-size:14px;opacity:.92;">${tagLine}</div><div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><span style="font-size:22px;font-weight:800;">₹${price.toLocaleString('en-IN')}</span>${save}<span style="font-size:13px;opacity:.9;">★ ${rating} rated by verified buyers</span></div></div>`,
    `<p style="font-size:15px;"><strong>${t}</strong> by <strong>${b}</strong> is one of the most loved picks in <strong>${c}</strong> this season. Every unit is 100% genuine, ships with a GST invoice, and passes a quality check before dispatch — so what you see in the photos is exactly what arrives at your door.</p>`,
    '<h3 style="font-size:18px;margin:22px 0 10px;">✨ Why you will love it</h3>',
    `<div style="display:flex;gap:12px;flex-wrap:wrap;">${feats}</div>`,
    `<h3 style="font-size:18px;margin:22px 0 10px;">🎯 Choose your ${escapeHtml(variantName)}</h3><p style="font-size:14px;color:#475569;">Available options:</p><div>${chips}</div>`,
    '<h3 style="font-size:18px;margin:22px 0 10px;">📋 Specifications</h3>',
    `<table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>`,
    '<h3 style="font-size:18px;margin:22px 0 10px;">📦 Bulk &amp; gifting</h3><p style="font-size:14px;">Ordering for a team, event or store? Bulk slabs auto-apply at checkout — 10+ units save 5%, 25+ save 8%, 50+ save 12%. Gift-ready packing available on request.</p>',
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px;font-size:13px;"><span style="background:#f0fdf4;border:1px solid #bbf7d0;padding:8px 14px;border-radius:10px;">🚚 Delivery in 2–5 days</span><span style="background:#eff6ff;border:1px solid #bfdbfe;padding:8px 14px;border-radius:10px;">↩ 7-day easy replacement</span><span style="background:#fefce8;border:1px solid #fde68a;padding:8px 14px;border-radius:10px;">🔒 Secure payments</span></div>',
    '</div>',
  ].join('');
}

async function checkUrlsLive(urls, concurrency = 20) {
  const list = [...new Set(urls)];
  const dead = [];
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const u = list[i++];
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(u, { headers: { Range: 'bytes=0-8191' }, signal: ctrl.signal, redirect: 'follow' });
        clearTimeout(t);
        const ct = res.headers.get('content-type') || '';
        try { await res.arrayBuffer(); } catch (_) { /* drain */ }
        if (!((res.status === 200 || res.status === 206) && ct.startsWith('image/'))) dead.push(`${u} -> ${res.status} ${ct}`);
      } catch (e) {
        dead.push(`${u} -> ${(e.cause && e.cause.code) || e.name}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { checked: list.length, dead };
}

async function main() {
  if (PRODUCTS.length !== 100) throw new Error(`Expected 100 products, defined ${PRODUCTS.length}`);
  if (!MONGO_URI) throw new Error('No MONGO_URI configured in .env');
  await mongoose.connect(MONGO_URI);
  console.log(`Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  if (process.env.SEED_RESET !== '1') {
    throw new Error('Refusing to reset data without SEED_RESET=1');
  }
  if (process.env.SEED_DB_CONFIRM && process.env.SEED_DB_CONFIRM !== mongoose.connection.name) {
    throw new Error(`Database confirmation mismatch: connected to ${mongoose.connection.name}`);
  }

  await Promise.all([
    Category, Brand, Product, User, Vendor, VendorMember, Review, Tenant, AuthPolicy,
    Order, Coupon, CouponRedemption, Bundle, Invoice, VendorLedger, Payout,
    InventoryMovement, ClickEvent,
  ].map(M => M.deleteMany({})));

  const tenant = await Tenant.create({
    key: 'platform', name: 'Tatoz', slug: 'tatoz', type: 'platform', status: 'active',
    domains: TENANT_DOMAINS,
    settings: { currency: 'INR', timezone: 'Asia/Kolkata', country: 'India' },
  });
  const admin = await User.create({
    name: 'Super Admin', email: process.env.ADMIN_EMAIL || 'admin@tatoz.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
    role: 'superadmin', isActive: true, isEmailVerified: true,
  });
  await AuthPolicy.create({
    tenant: tenant._id, primaryMode: 'password', activeMethods: ['password'],
    cartOtpProvider: 'disabled', updatedBy: admin._id,
  });
  console.log(`Tenant: ${tenant.key}; admin: ${admin.email}`);

  const catDocs = await Category.insertMany(CATEGORIES.map((c) => ({
    tenant: tenant._id, name: c.name, slug: c.slug, description: c.description,
    order: c.order, isActive: true,
  })));
  const catBySlug = Object.fromEntries(catDocs.map(c => [c.slug, c]));
  console.log(`Categories: ${catDocs.length}`);

  const brandDocs = await Brand.insertMany(BRANDS.map((b, i) => ({
    tenant: tenant._id, name: b, slug: slugify(b, { lower: true, strict: true }),
    description: `${b} products in the Tatoz demo catalogue.`,
    isActive: true, order: i + 1,
  })));
  console.log(`Brands: ${brandDocs.length}`);

  const userDocs = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const [name, email, city, state] = CUSTOMERS[i];
    userDocs.push(await User.create({
      name, email, password: 'Dummy@123', role: 'customer',
      phone: `98${String(10000000 + i * 137913).slice(0, 8)}`,
      isActive: true, isEmailVerified: true,
      addresses: [{
        fullName: name, phone: `98${String(10000000 + i * 137913).slice(0, 8)}`,
        street: `${101 + i}, MG Road`, city, state,
        pincode: String(400001 + i * 1111), country: 'India', isDefault: true,
      }],
    }));
  }
  console.log(`Customers: ${userDocs.length}`);

  const vendorIds = [];
  for (const v of VENDOR_DEFS) {
    const owner = await User.create({
      name: v.owner, email: v.email, password: 'Dummy@123',
      role: 'customer', isActive: true, isEmailVerified: true,
    });
    const vendor = await Vendor.create({
      owner: owner._id, tenant: tenant._id, storeName: v.name, slug: v.slug,
      contactEmail: v.email, contactPhone: '9810010010',
      description: `${v.name} — quality-checked demo catalogue seller.`,
      status: 'active', approvedAt: new Date(), approvedBy: admin._id,
      commissionRate: 10,
    });
    await User.findByIdAndUpdate(owner._id, { vendor: vendor._id });
    await VendorMember.create({ vendor: vendor._id, tenant: tenant._id, user: owner._id, role: 'owner', status: 'active' });
    vendorIds.push(vendor._id);
  }
  console.log(`Vendors: ${vendorIds.length}`);

  // ---- Remote image assignment (3 unique per product, category-relevant) ----
  const poolKey = (catSlug) => ({
    'home-and-kitchen': 'home', 'bags-and-backpacks': 'bags', 'sports-and-outdoors': 'sports',
    'toys-and-games': 'toys', 'health-and-personal-care': 'health', 'office-supplies': 'office',
    'pet-supplies': 'pet',
  }[catSlug] || catSlug);
  const poolPointers = Object.fromEntries(Object.keys(IMAGE_POOLS).map(k => [k, 0]));
  const assignedUrls = [];
  const productImages = PRODUCTS.map(([title, catSlug, brand]) => {
    const key = poolKey(catSlug);
    const pool = IMAGE_POOLS[key];
    const start = poolPointers[key];
    if (!pool || start + 3 > pool.length) throw new Error(`Image pool exhausted for ${catSlug}`);
    poolPointers[key] += 3;
    const urls = pool.slice(start, start + 3).map(imgUrl);
    assignedUrls.push(...urls);
    const alt = `${brand} ${title} — ${catSlug}`;
    return urls.map(u => ({ url: u, alt, publicId: u }));
  });
  console.log(`Live-checking ${assignedUrls.length} remote image URLs...`);
  const live = await checkUrlsLive(assignedUrls, 25);
  console.log(`Image check: ${live.checked} checked, ${live.dead.length} broken`);
  if (live.dead.length) {
    live.dead.slice(0, 15).forEach(d => console.error('BROKEN:', d));
    throw new Error(`${live.dead.length} broken image URLs — aborting seed`);
  }

  // ---- Products ----
  const productDocs = [];
  const usedHeroes = new Set();
  const brandFirstImage = {};
  for (let i = 0; i < PRODUCTS.length; i++) {
    const [title, catSlug, brand, basePrice, variantName, options, tags] = PRODUCTS[i];
    const images = productImages[i];
    const specs = buildSpecs(catSlug);
    const rating = Math.round((randInt(40, 49) / 10) * 10) / 10;
    const factors = [0.94, 1.0, 1.08, 1.16];
    const variants = [{
      name: variantName,
      options: options.map((value, oi) => {
        const price = Math.round((basePrice * factors[oi % factors.length]) / 10) * 10;
        const comparePrice = Math.round((price * (1 + [0.15, 0.22, 0.28, 0.18][oi % 4])) / 10) * 10;
        const optImgs = [images[oi % images.length]];
        return {
          value, stock: randInt(8, 80), reservedStock: 0, soldStock: randInt(0, 40),
          price, comparePrice,
          discount: Math.round(((comparePrice - price) / comparePrice) * 100),
          images: optImgs, thumbnail: optImgs[0].url,
        };
      }),
    }];
    const hasCompare = i % 3 !== 2;
    const comparePrice = hasCompare ? Math.round((basePrice * 1.22) / 10) * 10 : undefined;
    const vendorId = vendorIds[i % vendorIds.length];
    const doc = await Product.create({
      tenant: tenant._id,
      title,
      slug: slugify(`${brand}-${title}`, { lower: true, strict: true }),
      description: buildDescription({
        title, brand, catName: catBySlug[catSlug].name, tags,
        variantName, options, specifications: specs,
        price: basePrice, comparePrice, rating,
      }),
      shortDescription: `${brand} ${title}. Ships fast across India.`,
      price: basePrice, comparePrice,
      discount: comparePrice ? Math.round(((comparePrice - basePrice) / comparePrice) * 100) : 0,
      images, thumbnail: images[0].url,
      category: catBySlug[catSlug]._id, brand,
      sku: `DEMO-${String(i + 1).padStart(5, '0')}`,
      hsnCode: '9999', gstRate: 18,
      costPrice: Math.round(basePrice * 0.62),
      wholesalePrice: Math.round(basePrice * 0.85),
      bulkOrderEnabled: true,
      bulkOrderTiers: buildBulkTiers(basePrice),
      stock: randInt(20, 200), reservedStock: 0, soldStock: randInt(0, 300),
      incomingStock: randInt(0, 50), lowStockThreshold: 10,
      variantType: 'variable', productKind: 'physical',
      variants,
      specifications: specs,
      lifecycleStatus: 'active', approvalStatus: 'approved',
      tags, isActive: true,
      isFeatured: i % 7 === 0,
      isFlashDeal: i % 10 === 3,
      flashDealExpiry: i % 10 === 3 ? new Date(Date.now() + 5 * 864e5) : undefined,
      ratings: { average: 0, count: 0 },
      cro: buildCro(title, brand),
      seo: {
        metaTitle: `${title} by ${brand} — shop online`,
        metaDescription: `Shop ${brand} ${title}. Fast delivery across India. Easy replacement.`,
        keywords: [brand, title, ...tags.slice(0, 2)],
        robots: 'index, follow',
      },
      weight: randInt(100, 5000) / 100,
      dimensions: { length: randInt(10, 60), width: randInt(10, 40), height: randInt(5, 30) },
      createdBy: admin._id,
      vendor: vendorId,
      totalSales: randInt(0, 500), views: randInt(50, 8000),
    });
    productDocs.push(doc);
    usedHeroes.add(images[0].url);
    if (!brandFirstImage[brand]) brandFirstImage[brand] = images[0].url;
  }
  console.log(`Products: ${productDocs.length} (unique heroes: ${usedHeroes.size})`);

  const firstHeroByCat = {};
  for (const p of productDocs) {
    const slug = catDocs.find(c => c._id.equals(p.category)).slug;
    if (!firstHeroByCat[slug]) firstHeroByCat[slug] = p.thumbnail;
  }
  for (const c of catDocs) await Category.findByIdAndUpdate(c._id, { image: firstHeroByCat[c.slug] });
  for (const b of brandDocs) {
    if (brandFirstImage[b.name]) await Brand.findByIdAndUpdate(b._id, { image: brandFirstImage[b.name] });
  }

  // ---- Reviews (4 per product) ----
  const reviewDocs = [];
  for (let p = 0; p < productDocs.length; p++) {
    const product = productDocs[p];
    for (let k = 0; k < 4; k++) {
      const user = userDocs[(p * 4 + k) % userDocs.length];
      reviewDocs.push({
        tenant: tenant._id,
        product: product._id, user: user._id,
        rating: pick([5, 5, 5, 4, 4, 4, 3]),
        title: pick(REVIEW_TITLES), comment: pick(REVIEW_COMMENTS),
        images: k === 0 ? [product.thumbnail] : [],
        isVerifiedPurchase: true, verifiedAt: new Date(),
        status: 'approved', helpful: randInt(0, 40),
      });
    }
  }
  await Review.insertMany(reviewDocs);
  console.log(`Reviews: ${reviewDocs.length}`);
  for (const product of productDocs) {
    const agg = await Review.aggregate([
      { $match: { product: product._id, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (agg.length) {
      await Product.findByIdAndUpdate(product._id, {
        ratings: { average: Math.round(agg[0].avg * 10) / 10, count: agg[0].count },
      });
    }
  }

  // ---- Coupons ----
  const beautyCat = catDocs.find(c => c.slug === 'beauty');
  const couponDocs = await Coupon.insertMany(COUPONS.map((c) => ({
    ...c, tenant: tenant._id, expiresAt: daysAgo(-c.expiresInDays), isActive: true,
    startDate: daysAgo(10), usageCount: 0, userLimit: 1,
    allowedChannels: ['website', 'app'],
    applicableCategories: c.code === 'FESTIVE15' && beautyCat ? [beautyCat._id] : [],
  })));
  const couponByCode = Object.fromEntries(couponDocs.map(c => [c.code, c]));
  const byTitle = Object.fromEntries(productDocs.map(p => [p.title, p]));
  const comboTitles = [...new Set(BUNDLES.flatMap(b => b[2]))];
  await Coupon.findByIdAndUpdate(couponByCode.COMBO20._id, {
    bundleProducts: comboTitles.map(t => byTitle[t]._id),
  });
  console.log(`Coupons: ${couponDocs.length}`);

  // ---- Bundles ----
  const bundleDocs = [];
  for (let i = 0; i < BUNDLES.length; i++) {
    const [name, bundleType, titles, tags] = BUNDLES[i];
    const comps = titles.map(t => byTitle[t]);
    if (comps.some(c => !c)) throw new Error(`Product missing for bundle ${name}`);
    const sum = comps.reduce((s, p) => s + p.price, 0);
    const price = Math.round((sum * 0.85) / 10) * 10;
    const first = comps[0];
    bundleDocs.push(await Bundle.create({
      tenant: tenant._id, name, bundleType,
      slug: slugify(name, { lower: true, strict: true }),
      sku: `CMB-${String(i + 1).padStart(4, '0')}`,
      description: `${name} — curated value pack. ${comps.map(c => c.title).join(', ')}.`,
      shortDescription: `Save more with the ${name}.`,
      components: comps.map((p, ci) => ({
        product: p._id, quantity: 1, required: true, sortOrder: ci,
        defaultVariant: p.variants?.[0]?.options?.[0]
          ? { [p.variants[0].name]: p.variants[0].options[0].value } : {},
      })),
      price, comparePrice: sum, pricingType: 'fixed',
      discountType: 'percentage', discountValue: 15,
      costPrice: comps.reduce((s, p) => s + (p.costPrice || 0), 0),
      hsnCode: '9999', gstRate: 18,
      image: first.thumbnail,
      gallery: first.images?.slice(0, 2).map(im => ({ url: im.url, alt: name, publicId: im.url })) || [],
      tags, category: first.category, vendor: first.vendor,
      stats: { views: randInt(200, 3000), addToCart: randInt(20, 400), unitsSold: 0, revenue: 0, discount: 0 },
      lifecycleStatus: 'active', isActive: true,
      createdBy: admin._id,
    }));
  }
  console.log(`Bundles: ${bundleDocs.length}`);

  // ---- Orders (30 across the lifecycle) + redemptions ----
  const orderScenarios = [
    ['pending', 'cod', 'pending'], ['confirmed', 'razorpay', 'paid'],
    ['processing', 'upi', 'paid'], ['packed', 'cod', 'pending'],
    ['ready_to_ship', 'cod', 'pending'], ['shipped', 'razorpay', 'paid'],
    ['out_for_delivery', 'cashfree', 'paid'], ['delivered', 'razorpay', 'paid'],
    ['cancelled', 'cod', 'refunded'], ['returned', 'cod', 'refunded'],
    ['confirmed', 'razorpay', 'paid'], ['processing', 'upi', 'paid'],
    ['packed', 'cod', 'pending'], ['ready_to_ship', 'cod', 'pending'],
    ['shipped', 'razorpay', 'paid'], ['delivered', 'razorpay', 'paid'],
    ['pending', 'cod', 'pending'], ['confirmed', 'cashfree', 'paid'],
    ['processing', 'upi', 'paid'], ['delivered', 'razorpay', 'paid'],
    ['cancelled', 'cod', 'refunded'], ['returned', 'cod', 'refunded'],
    ['ready_to_ship', 'cod', 'pending'], ['shipped', 'razorpay', 'paid'],
    ['delivered', 'razorpay', 'paid'], ['pending', 'cod', 'pending'],
    ['confirmed', 'upi', 'paid'], ['processing', 'razorpay', 'paid'],
    ['packed', 'cod', 'pending'], ['delivered', 'cashfree', 'paid'],
  ];
  const orderDocs = [];
  const redemptionDocs = [];
  const eventDocs = [];
  const couponCycle = ['WELCOME10', 'FLAT200', 'FESTIVE15'];
  for (let i = 0; i < orderScenarios.length; i += 1) {
    const [status, paymentMethod, paymentStatus] = orderScenarios[i];
    const user = userDocs[i % userDocs.length];
    const product = productDocs[(i * 7) % productDocs.length];
    const quantity = (i % 3) + 1;
    const price = Number(product.price);
    const subtotal = price * quantity;
    let coupon = null;
    let discount = 0;
    if (i % 2 === 0) {
      const code = couponCycle[(i / 2) % couponCycle.length];
      const c = couponByCode[code];
      if (c && subtotal >= (c.minOrderAmount || 0)) {
        coupon = c;
        discount = c.type === 'percentage'
          ? Math.min(Math.round((subtotal * c.value) / 100), c.maxDiscount || Infinity)
          : Math.min(c.value, subtotal);
      }
    }
    const shippingCost = i % 4 === 0 ? 0 : 79;
    const taxableAmount = Math.max(0, subtotal + shippingCost - discount);
    const tax = Math.round(taxableAmount * 0.18 * 100) / 100;
    const total = Math.round((taxableAmount + tax) * 100) / 100;
    const createdAt = new Date(Date.now() - (i + 1) * 2 * 60 * 60 * 1000);
    const orderNumber = `DEMO-ORDER-${String(i + 1).padStart(3, '0')}`;
    const address = user.addresses?.[0]?.toObject?.() || user.addresses?.[0];
    const item = {
      itemType: 'product', product: product._id, title: product.title,
      image: product.thumbnail, price, costPrice: product.costPrice,
      costPriceCaptured: true, quantity,
      variant: { [product.variants?.[0]?.name || 'Option']: product.variants?.[0]?.options?.[0]?.value },
      sku: product.sku, hsnCode: product.hsnCode, taxRate: 18,
      taxableAmount, taxAmount: tax,
    };
    const commissionRate = 10;
    const commissionableAmount = Math.max(0, subtotal - discount);
    const commissionAmount = Math.round(commissionableAmount * commissionRate / 100 * 100) / 100;
    const vendorEarnings = Math.round((commissionableAmount - commissionAmount + shippingCost + tax) * 100) / 100;
    const subOrder = {
      vendor: product.vendor, orderNumber: `${orderNumber}-V1`, items: [item], subtotal,
      shippingCost, tax, discount, total, commissionRate, commissionableAmount,
      commissionAmount, vendorEarnings, status, paymentStatus,
      trackingNumber: ['shipped', 'out_for_delivery', 'delivered'].includes(status) ? `DEMO-AWB-${String(i + 1).padStart(3, '0')}` : '',
      courierName: ['Delhivery', 'Blue Dart', 'DTDC'][i % 3],
      statusHistory: [{ status, note: 'Seeded demo order', updatedBy: admin._id, updatedAt: createdAt }],
      deliveredAt: status === 'delivered' ? new Date(createdAt.getTime() + 4 * 864e5) : undefined,
    };
    const order = await Order.create({
      tenant: tenant._id, orderNumber, user: user._id, items: [item],
      shippingAddress: address, billingAddress: address, paymentMethod, paymentStatus,
      paymentProvider: paymentStatus === 'paid' ? paymentMethod : '',
      paymentVerifiedAt: paymentStatus === 'paid' ? createdAt : undefined,
      orderStatus: status, returnStatus: status === 'returned' ? 'closed' : 'none',
      subtotal, shippingCost, tax, taxableAmount, cgst: tax / 2, sgst: tax / 2,
      discount, total, amountPaid: paymentStatus === 'paid' ? total : 0,
      amountDue: paymentStatus === 'paid' ? 0 : total, inventoryStatus: 'legacy',
      referralSource: ['google', 'instagram', 'direct', 'email'][i % 4],
      trackingSessionId: `${SEED_PREFIX}-session-${i + 1}`,
      shippingMethod: 'standard',
      subOrders: [subOrder],
      trackingNumber: subOrder.trackingNumber || `DEMO-TRACK-${String(i + 1).padStart(3, '0')}`,
      courierName: subOrder.courierName, shippingProvider: 'demo',
      shippingStatus: status === 'delivered' ? 'delivered' : subOrder.trackingNumber ? 'in_transit' : 'created',
      coupon: coupon?._id, couponCode: coupon?.code,
      statusHistory: [{ status, note: 'Seeded demo order', updatedBy: admin._id, updatedAt: createdAt }],
      createdAt, updatedAt: createdAt,
    });
    orderDocs.push(order);
    if (coupon) {
      redemptionDocs.push({
        tenant: tenant._id, coupon: coupon._id, order: order._id, user: user._id,
        code: coupon.code, discountAmount: discount,
        status: paymentStatus === 'paid' ? 'captured' : 'reserved',
        capturedAt: paymentStatus === 'paid' ? createdAt : undefined,
      });
      await Coupon.findByIdAndUpdate(coupon._id, {
        $inc: { usageCount: 1 },
        $push: { usedBy: { user: user._id, order: order._id, usedAt: createdAt } },
      });
    }
    eventDocs.push(...[
      ['page_view', `/products/${product.slug}`], ['product_click', `/products/${product.slug}`],
      ['add_to_cart', `/products/${product.slug}`], ['checkout_start', '/checkout'],
      ['order_placed', `/order-confirmation/${order._id}`],
    ].map(([eventType, page]) => ({
      tenant: tenant._id, userId: user._id, sessionId: `${SEED_PREFIX}-session-${i + 1}`,
      eventType, page, target: product.title, targetId: String(product._id),
      metadata: { source: 'seed', orderId: String(order._id) },
      userAgent: 'TatozDemoSeed/1.0', device: i % 3 === 0 ? 'mobile' : 'desktop',
      createdAt: new Date(createdAt.getTime() + 60 * 1000),
    })));
  }
  await CouponRedemption.insertMany(redemptionDocs);
  await ClickEvent.insertMany(eventDocs);
  console.log(`Orders: ${orderDocs.length}; redemptions: ${redemptionDocs.length}; events: ${eventDocs.length}`);

  // ---- Invoices for delivered orders ----
  let invN = 0;
  for (const o of orderDocs.filter(o => o.orderStatus === 'delivered')) {
    invN++;
    const items = o.items.map((l, idx) => {
      const gross = l.price * l.quantity;
      const taxLine = Math.round(gross * 0.18);
      return {
        itemIndex: idx, product: l.product, title: l.title, sku: l.sku || '', hsnCode: l.hsnCode || '9999',
        quantity: l.quantity, unitPrice: l.price, grossAmount: gross,
        taxableAmount: gross, cgst: Math.round(taxLine / 2), sgst: taxLine - Math.round(taxLine / 2), tax: taxLine,
      };
    });
    const inv = await Invoice.create({
      tenant: tenant._id, order: o._id, orderNumber: o.orderNumber,
      invoiceNumber: `INV-2026-${String(invN).padStart(4, '0')}`,
      documentType: 'tax_invoice', status: 'issued', source: 'automatic',
      items, subtotal: o.subtotal, discount: o.discount, shippingCost: o.shippingCost,
      taxableAmount: o.taxableAmount, cgst: o.cgst, sgst: o.sgst, tax: o.tax, total: o.total,
      currency: 'INR', paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    });
    await Order.findByIdAndUpdate(o._id, { invoice: inv._id, invoiceNumber: inv.invoiceNumber, invoiceIssuedAt: o.createdAt });
  }
  console.log(`Invoices: ${invN}`);

  // ---- Vendor ledger + payouts ----
  for (const vendorId of vendorIds) {
    const vendorOrders = orderDocs.filter(o => String(o.subOrders?.[0]?.vendor) === String(vendorId));
    const completed = vendorOrders.filter(o => ['delivered', 'shipped', 'out_for_delivery'].includes(o.orderStatus));
    const balance = completed.reduce((sum, o) => sum + Number(o.subOrders[0].vendorEarnings || 0), 0);
    if (completed.length) {
      await VendorLedger.create({
        vendor: vendorId, type: 'sale_credit', amount: balance, balanceAfter: balance,
        reference: { subOrder: completed[0]._id }, note: 'Seeded demo sales credit', createdBy: admin._id,
      });
    }
    const payoutAmt = Math.min(1000, Math.max(250, Math.round(balance)));
    await Payout.create({
      tenant: tenant._id, vendor: vendorId, amount: payoutAmt,
      commissionDeducted: Math.round(payoutAmt * 0.1 * 100) / 100,
      netAmount: Math.round(payoutAmt * 0.9 * 100) / 100,
      status: 'completed', transactionRef: `${SEED_PREFIX}-payout-${vendorId}`,
      bankSnapshot: { accountHolderName: 'Demo Vendor Account', accountNumber: '000000000000', ifscCode: 'DEMO0000001', bankName: 'Demo Bank' },
      processedAt: new Date(), processedBy: admin._id, notes: 'Seeded demo payout',
    });
    await Vendor.findByIdAndUpdate(vendorId, {
      $set: { walletBalance: balance, totalEarnings: balance, totalWithdrawn: payoutAmt },
    });
  }

  // ---- Inventory movements ----
  await InventoryMovement.insertMany(productDocs.map(product => ({
    tenant: tenant._id, product: product._id, type: 'restock', quantity: product.stock,
    availableBefore: 0, availableAfter: product.stock, reservedBefore: 0, reservedAfter: 0,
    soldBefore: 0, soldAfter: product.soldStock, reason: 'Demo store opening stock',
    idempotencyKey: `${SEED_PREFIX}-restock-${product._id}`,
  })));

  // ---- User + vendor rollups ----
  for (const user of userDocs) {
    const mine = orderDocs.filter(o => String(o.user) === String(user._id));
    const spent = mine.reduce((sum, o) => sum + Number(o.total || 0), 0);
    await User.findByIdAndUpdate(user._id, {
      $set: { orderCount: mine.length, totalSpent: spent, lastOrderAt: mine[0]?.createdAt },
    });
  }
  for (const vid of vendorIds) {
    const total = await Product.countDocuments({ vendor: vid });
    await Vendor.findByIdAndUpdate(vid, { $set: { 'stats.totalProducts': total, 'stats.activeProducts': total } });
  }

  // ---- Verification ----
  console.log('--- Verification ---');
  const errors = [];
  const counts = {
    tenants: await Tenant.countDocuments({ key: 'platform' }),
    categories: await Category.countDocuments(),
    brands: await Brand.countDocuments(),
    users: await User.countDocuments(),
    vendors: await Vendor.countDocuments(),
    products: await Product.countDocuments(),
    reviews: await Review.countDocuments(),
    coupons: await Coupon.countDocuments(),
    bundles: await Bundle.countDocuments(),
    orders: await Order.countDocuments(),
    redemptions: await CouponRedemption.countDocuments(),
    invoices: await Invoice.countDocuments(),
    ledger: await VendorLedger.countDocuments(),
    payouts: await Payout.countDocuments(),
    inventoryMovements: await InventoryMovement.countDocuments(),
  };
  console.log(counts);
  if (counts.tenants !== 1) errors.push(`tenants=${counts.tenants}`);
  if (counts.categories !== 15) errors.push(`categories=${counts.categories}`);
  if (counts.products !== 100) errors.push(`products=${counts.products}`);
  if (counts.reviews !== 400) errors.push(`reviews=${counts.reviews}`);
  if (counts.coupons !== 8) errors.push(`coupons=${counts.coupons}`);
  if (counts.bundles !== 6) errors.push(`bundles=${counts.bundles}`);
  if (counts.orders !== 30) errors.push(`orders=${counts.orders}`);
  if (counts.invoices < 1) errors.push(`invoices=${counts.invoices}`);
  if (counts.payouts !== vendorIds.length) errors.push(`payouts=${counts.payouts}`);

  const remoteRe = /^https:\/\/images\.unsplash\.com\/photo-[A-Za-z0-9-]+\?/;
  const allProducts = await Product.find({ tenant: tenant._id }).lean();
  const heroes = new Set();
  for (const p of allProducts) {
    heroes.add(p.thumbnail);
    if (!p.images || p.images.length !== 3) errors.push(`${p.slug}: images=${p.images?.length}`);
    if (!p.thumbnail) errors.push(`${p.slug}: no thumbnail`);
    if (!p.description || !p.description.includes('product-description') || !p.description.includes('<table') || !p.description.includes('<h3')) {
      errors.push(`${p.slug}: description is not beautiful HTML`);
    }
    if (p.variantType !== 'variable' || !p.variants?.length || !p.variants[0].options?.length) errors.push(`${p.slug}: variants incomplete`);
    if (!p.bulkOrderEnabled || !p.bulkOrderTiers?.length || p.bulkOrderTiers.length !== 3) errors.push(`${p.slug}: bulk tiers incomplete`);
    for (const image of [p.thumbnail, ...(p.images || []).map(item => item.url)]) {
      if (!remoteRe.test(image || '')) errors.push(`${p.slug}: non-remote image ${image}`);
    }
    for (const o of p.variants?.[0]?.options || []) {
      if (!(o.price > 0) || !(o.images?.length) || !o.thumbnail) errors.push(`${p.slug}: option ${o.value} incomplete`);
    }
    if (!p.specifications?.length) errors.push(`${p.slug}: no specifications`);
    if (p.ratings?.count !== 4) errors.push(`${p.slug}: ratings.count=${p.ratings?.count}`);
  }
  if (heroes.size !== 100) errors.push(`unique heroes=${heroes.size}`);

  if (errors.length) {
    console.error(`VERIFY FAILED (${errors.length}):`);
    errors.slice(0, 30).forEach(e => console.error(' -', e));
    process.exit(1);
  }
  console.log('Demo store seed complete — all checks passed.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
