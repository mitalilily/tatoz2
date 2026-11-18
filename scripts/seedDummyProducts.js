require('dotenv').config();
const mongoose = require('mongoose');
const slugify = require('slugify');

const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const { PLATFORM_NAME } = require('../constants/branding');

const MONGO_URI = process.env.MONGO_URI_SEED || process.env.MONGO_URI;

const CATEGORIES = [
  { name: 'Apparel', description: 'Clothing for men, women and kids', order: 1 },
  { name: 'Footwear', description: 'Shoes, sandals and sneakers', order: 2 },
  { name: 'Electronics', description: 'Phones, laptops and gadgets', order: 3 },
  { name: 'Home & Kitchen', description: 'Furniture, decor and kitchen essentials', order: 4 },
  { name: 'Beauty', description: 'Skincare, makeup and grooming', order: 5 },
  { name: 'Accessories', description: 'Belts, scarves, sunglasses and more', order: 6 },
  { name: 'Bags & Backpacks', description: 'Handbags, totes, backpacks and luggage', order: 7 },
  { name: 'Watches', description: 'Analog, digital and smartwatches', order: 8 },
  { name: 'Sports & Outdoors', description: 'Fitness gear, camping and cycling', order: 9 },
  { name: 'Books', description: 'Fiction, non-fiction and textbooks', order: 10 },
  { name: 'Toys & Games', description: 'Action figures, board games and puzzles', order: 11 },
  { name: 'Jewelry', description: 'Rings, necklaces, earrings and bracelets', order: 12 },
  { name: 'Health & Personal Care', description: 'Vitamins, wellness and hygiene', order: 13 },
  { name: 'Pet Supplies', description: 'Food, toys and accessories for pets', order: 14 },
  { name: 'Office Supplies', description: 'Stationery, desk organizers and office tools', order: 15 },
];

const BRANDS = [
  { name: 'Nike', description: 'Athletic footwear and apparel', order: 1 },
  { name: 'Adidas', description: 'Sportswear and sneakers', order: 2 },
  { name: 'Puma', description: 'Sports and lifestyle', order: 3 },
  { name: 'Reebok', description: 'Fitness and lifestyle', order: 4 },
  { name: 'Samsung', description: 'Consumer electronics', order: 5 },
  { name: 'Apple', description: 'Premium consumer electronics', order: 6 },
  { name: 'Sony', description: 'Audio, gaming and entertainment', order: 7 },
  { name: 'LG', description: 'Home appliances and electronics', order: 8 },
  { name: 'IKEA', description: 'Affordable home furnishings', order: 9 },
  { name: 'Zara', description: 'Contemporary fashion', order: 10 },
  { name: 'H&M', description: 'Everyday fashion', order: 11 },
  { name: "Levi's", description: 'Denim and casualwear', order: 12 },
  { name: 'Fossil', description: 'Watches, bags and accessories', order: 13 },
  { name: 'Casio', description: 'Watches and electronics', order: 14 },
  { name: 'Timex', description: 'Affordable watches', order: 15 },
  { name: 'Lakme', description: 'Beauty and cosmetics', order: 16 },
  { name: 'Maybelline', description: 'Makeup and beauty', order: 17 },
  { name: "L'Oreal", description: 'Haircare, skincare and beauty', order: 18 },
  { name: 'Lego', description: 'Building toys', order: 19 },
  { name: 'Penguin', description: 'Books and publishing', order: 20 },
  { name: 'Faber-Castell', description: 'Art and stationery supplies', order: 21 },
  { name: 'Wildcraft', description: 'Outdoor and travel gear', order: 22 },
  { name: 'Noise', description: 'Smartwatches and audio', order: 23 },
  { name: 'Cello', description: 'Homeware and kitchen', order: 24 },
  { name: 'Boat', description: 'Audio and wearables', order: 25 },
];

const UNSPLASH_BY_CATEGORY = {
  apparel: [
    '1490481651871-ab68de25d43d', '1485518882345-15568b007407', '1483985988355-763728e1935b',
    '1539109136881-3be0616acf4b', '1521572163474-6864f9cf17ab', '1583743814966-8936f5b7be1a',
    '1581338834647-b0fb40704e21', '1549298916-b41d501d3772', '1591047139829-d91aecb6caea',
    '1606107557195-0e29a4b5b4aa', '1576566588028-4147f3842f27', '1556821840-3a63f95609a7',
  ],
  footwear: [
    '1542291026-7eec264c27ff', '1600185365926-3a2ce3cdb9eb', '1595950653106-6c9ebd614d3a',
    '1608237133924-7c5a3a7e5b3c', '1605408499391-6368c628ef42', '1551107696-a4b0c5a0d9c2',
    '1539185441755-769473a23570', '1525966222134-fcfa99b8ae77', '1581003853234-7ce61c4b8c52',
    '1614252369475-531eba835eb1',
  ],
  electronics: [
    '1517336714731-489689fd1ca8', '1574944985070-8f3ebc6b79d2', '1593642632559-0c6d3fc62b89',
    '1546054454-aa26e2b734c7', '1572569511254-d8f925fe2cbb', '1601944179066-29786cb9d32a',
    '1593344484962-3990551d4e0e', '1611791484670-ce19b801d192', '1533228876829-65c94e7b5025',
    '1573739022854-abf977c1c8a3',
  ],
  'home-and-kitchen': [
    '1556909114-f6e7ad7d3136', '1567016376408-0226e4d0c1ea', '1556909172-54557c7e4fb7',
    '1493663284031-b7e3aefcae8e', '1567538096630-e0c55bd6374c', '1505693416388-ac5ce068fe55',
    '1556909195-77fab8b86bb6', '1540518614846-7eded433c457', '1581539250439-b96689ed3c80',
    '1556228453-efd6c1ff04f6',
  ],
  beauty: [
    '1522335789203-aaa5d6d8e7c9', '1571781926291-c477ebfd024b', '1596462502278-27bfdc403348',
    '1612817288484-6f916006741a', '1556228720-195a672e8a03', '1620916566398-39f1143ab7be',
    '1599733589046-8a35a4d3da0c', '1571781926291-c477ebfd024b', '1583241475880-083f84372725',
    '1503233888257-5d34e2c1d3a4',
  ],
  accessories: [
    '1572635196237-14b3f281503f', '1556307083-f6e1beaf8d5e', '1508296693086-25724c8b27fc',
    '1577803645773-f97870573e4f', '1492708636630-0d3d2d2d9b3b', '1606760227091-3dd870d97f1d',
    '1547949003-9792a18a2601', '1574854376063-c0f63d6f2a4d',
  ],
  'bags-and-backpacks': [
    '1553062407-98eeb64c6a62', '1548036328-c9fa89d128fa', '1577733966973-d0b67d449f1b',
    '1591561954557-26941169b49e', '1553062407-98eeb64c6a62', '1581605405671-7e98d4b1aa3a',
    '1547949003-9792a18a2601', '1622445275576-721325763afe',
  ],
  watches: [
    '1524805444758-089113d48a6d', '1577803645773-f97870573e4f', '1523275335684-37898b6baf30',
    '1509048191080-d2984fad6a5f', '1495856458515-0637185db551', '1577803645773-f97870573e4f',
    '1547996160-81dfbe806d29', '1524805444758-089113d48a6d',
  ],
  'sports-and-outdoors': [
    '1517649763962-0c623066013b', '1571019613454-1cb2f99b2d8b', '1530143584546-02191bc84eb5',
    '1551244072-5d12893278ab', '1579751626657-72bc17010426', '1599058917765-a780eda9a787',
    '1571902943202-507ec2618e8f', '1593071598216-9e9c0f00c1c7',
  ],
  books: [
    '1544947950-fa07a98d237f', '1495446815901-a7297e633e8d', '1512820790803-83ca1da1947d',
    '1543002588-bfa74002ed7e', '1532012197260-da5d4785b5cc', '1518495973542-4542c06a5843',
    '1481627834876-b7833e8f5570', '1524995997946-a1c2e315a42f',
  ],
  'toys-and-games': [
    '1558060370-d644479cb6f7', '1596461404969-9ae70f2830c1', '1607536003575-5d6d4d3c8e3e',
    '1535578459829-94b1bd5a5fbb', '1607082348824-0a96f2a4b9da', '1572635196237-14b3f281503f',
    '1558877385-8d3c5c2dc61e', '1569447922-0f3a3b2e0f6e',
  ],
  jewelry: [
    '1599643478518-a784e5dc4c8f', '1611652022419-a9419f74343d', '1602173574767-37ac01994d2a',
    '1573408301185-9146fe634ad0', '1601121141461-9d66406b1a44', '1617038220319-276d3fba8f5b',
    '1535632787350-4e68ef0ac584', '1518495973542-4542c06a5843',
  ],
  'health-and-personal-care': [
    '1556228720-195a672e8a03', '1584305574647-0cc949a2bb9f', '1620916566398-39f1143ab7be',
    '1576091160550-2173dba999ef', '1584017911766-d451b3d0e843', '1571781926291-c477ebfd024b',
    '1607613009820-a29f7bb4819e', '1556228578-8c89e6adf883',
  ],
  'pet-supplies': [
    '1601758228041-f3b2795255f1', '1583511655857-d19b40a7a54c', '1583337130417-3346a1be251e',
    '1591946614720-90a587da4a36', '1560807707-8cc77767d783', '1583512603805-3cc6b41f3edb',
    '1601758124510-52d02ddb7cbd',
  ],
  'office-supplies': [
    '1583484963886-cfe2bff2945f', '1497032628192-86f99bc70b22', '1606327054629-64c8b0fd6e4f',
    '1568871388666-bf50b9e1b9b6', '1583484963886-cfe2bff2945f', '1611532736597-2bdb38f5ab02',
  ],
};

const PRODUCT_TEMPLATES = [
  // Apparel — 18 items
  { categorySlug: 'apparel', brandName: 'Nike',     basePrice: 1999, title: 'Dri-FIT Running T-Shirt',         tags: ['running', 'sportswear', 'mesh'] },
  { categorySlug: 'apparel', brandName: 'Adidas',   basePrice: 2499, title: '3-Stripe Cotton Tee',             tags: ['cotton', 'casual', 'unisex'] },
  { categorySlug: 'apparel', brandName: 'Nike',     basePrice: 3299, title: 'Pro Compression Shorts',          tags: ['compression', 'gym', 'stretch'] },
  { categorySlug: 'apparel', brandName: 'Puma',     basePrice: 1799, title: 'Essentials Hoodie',               tags: ['hoodie', 'fleece', 'casual'] },
  { categorySlug: 'apparel', brandName: 'Reebok',   basePrice: 2199, title: 'Workout Tank Top',                tags: ['tank', 'gym', 'breathable'] },
  { categorySlug: 'apparel', brandName: 'Zara',     basePrice: 2999, title: 'Slim Fit Blazer',                 tags: ['blazer', 'formal', 'office'] },
  { categorySlug: 'apparel', brandName: 'H&M',      basePrice: 1499, title: 'Basic Crew-Neck T-Shirt',         tags: ['tee', 'basics', 'cotton'] },
  { categorySlug: 'apparel', brandName: "Levi's",   basePrice: 3999, title: '511 Slim Fit Jeans',              tags: ['denim', 'jeans', 'slim'] },
  { categorySlug: 'apparel', brandName: 'Zara',     basePrice: 2299, title: 'Pleated Midi Skirt',              tags: ['skirt', 'midi', 'formal'] },
  { categorySlug: 'apparel', brandName: 'H&M',      basePrice: 1899, title: 'Oversized Knit Sweater',          tags: ['knit', 'cozy', 'winter'] },
  { categorySlug: 'apparel', brandName: 'Nike',     basePrice: 2799, title: 'Windrunner Jacket',               tags: ['jacket', 'wind', 'running'] },
  { categorySlug: 'apparel', brandName: 'Adidas',   basePrice: 2599, title: 'Tiro Track Pants',                tags: ['track', 'training', 'polyester'] },
  { categorySlug: 'apparel', brandName: 'Puma',     basePrice: 1199, title: 'Logo Cap',                        tags: ['cap', 'accessory', 'casual'] },
  { categorySlug: 'apparel', brandName: 'Reebok',   basePrice: 1699, title: 'Polo Shirt',                      tags: ['polo', 'smart', 'casual'] },
  { categorySlug: 'apparel', brandName: 'Zara',     basePrice: 3499, title: 'Tailored Trousers',               tags: ['trousers', 'formal', 'wool'] },
  { categorySlug: 'apparel', brandName: "Levi's",   basePrice: 2299, title: '501 Original Jeans',             tags: ['denim', 'classic', 'jeans'] },
  { categorySlug: 'apparel', brandName: 'H&M',      basePrice: 999,  title: 'Cotton Boxers 3-Pack',            tags: ['underwear', 'basics'] },
  { categorySlug: 'apparel', brandName: 'Nike',     basePrice: 4499, title: 'Tech Fleece Hoodie',             tags: ['fleece', 'hoodie', 'tech'] },

  // Footwear — 10 items
  { categorySlug: 'footwear', brandName: 'Nike',    basePrice: 5999, title: 'Air Zoom Pegasus 40',             tags: ['running', 'cushioned'] },
  { categorySlug: 'footwear', brandName: 'Adidas',  basePrice: 5499, title: 'Ultraboost 23',                   tags: ['running', 'boost', 'premium'] },
  { categorySlug: 'footwear', brandName: 'Puma',    basePrice: 3499, title: 'Suede Classic XXI',               tags: ['suede', 'lifestyle'] },
  { categorySlug: 'footwear', brandName: 'Reebok',  basePrice: 2999, title: 'Classic Leather',                 tags: ['leather', 'lifestyle'] },
  { categorySlug: 'footwear', brandName: 'Nike',    basePrice: 4999, title: 'Revolution 7',                    tags: ['running', 'training'] },
  { categorySlug: 'footwear', brandName: 'Adidas',  basePrice: 4499, title: 'Stan Smith',                      tags: ['tennis', 'classic'] },
  { categorySlug: 'footwear', brandName: 'Puma',    basePrice: 2799, title: 'Clyde Court Lo',                  tags: ['basketball', 'lifestyle'] },
  { categorySlug: 'footwear', brandName: 'Nike',    basePrice: 6999, title: 'Air Force 1 07',                  tags: ['lifestyle', 'iconic'] },
  { categorySlug: 'footwear', brandName: 'Adidas',  basePrice: 6499, title: 'NMD_R1',                          tags: ['lifestyle', 'boost'] },
  { categorySlug: 'footwear', brandName: 'Reebok',  basePrice: 3999, title: 'Zig Kinetica 2.5',               tags: ['zig', 'running'] },

  // Electronics — 14 items
  { categorySlug: 'electronics', brandName: 'Samsung', basePrice: 34999, title: 'Galaxy A55 5G',                  tags: ['phone', '5g', 'android'] },
  { categorySlug: 'electronics', brandName: 'Apple',   basePrice: 79900, title: 'iPhone 15',                      tags: ['iphone', 'a16', 'premium'] },
  { categorySlug: 'electronics', brandName: 'Sony',    basePrice: 12990, title: 'WH-1000XM5 Headphones',           tags: ['anc', 'wireless', 'over-ear'] },
  { categorySlug: 'electronics', brandName: 'Apple',   basePrice: 24900, title: 'iPad Air 11"',                    tags: ['tablet', 'm2'] },
  { categorySlug: 'electronics', brandName: 'Samsung', basePrice: 22990, title: 'Galaxy Buds2 Pro',                tags: ['earbuds', 'wireless'] },
  { categorySlug: 'electronics', brandName: 'LG',      basePrice: 18990, title: '27" 4K UltraGear Monitor',        tags: ['monitor', '4k', 'gaming'] },
  { categorySlug: 'electronics', brandName: 'Sony',    basePrice: 54990, title: 'Bravia 50" 4K Smart TV',          tags: ['tv', '4k', 'smart'] },
  { categorySlug: 'electronics', brandName: 'Apple',   basePrice: 49900, title: 'MacBook Air M3',                  tags: ['laptop', 'm3', 'ultrathin'] },
  { categorySlug: 'electronics', brandName: 'Samsung', basePrice: 89000, title: 'Galaxy Tab S9 FE',                tags: ['tablet', 'stylus'] },
  { categorySlug: 'electronics', brandName: 'LG',      basePrice: 32990, title: '1.5 Ton 5-Star Inverter Split AC', tags: ['ac', 'inverter'] },
  { categorySlug: 'electronics', brandName: 'Sony',    basePrice: 7990,  title: 'HT-S20R 5.1 Soundbar',            tags: ['soundbar', '5.1'] },
  { categorySlug: 'electronics', brandName: 'Samsung', basePrice: 28990, title: '43" Crystal 4K UHD TV',           tags: ['tv', 'uhd'] },
  { categorySlug: 'electronics', brandName: 'Apple',   basePrice: 19900, title: 'Apple Watch Series 9',            tags: ['smartwatch', 'gps', 'health'] },
  { categorySlug: 'electronics', brandName: 'Noise',   basePrice: 1999,  title: 'ColorFit Pulse 2 Max',            tags: ['smartwatch', 'budget'] },

  // Home & Kitchen — 12 items
  { categorySlug: 'home-and-kitchen', brandName: 'IKEA',    basePrice: 12990, title: 'BILLY Bookcase',                  tags: ['bookcase', 'storage'] },
  { categorySlug: 'home-and-kitchen', brandName: 'IKEA',    basePrice: 8990,  title: 'KALLAX Shelf Unit',               tags: ['shelf', 'storage'] },
  { categorySlug: 'home-and-kitchen', brandName: 'Cello',   basePrice: 1990,  title: 'Dinnerware Set 16-Piece',         tags: ['dinnerware', 'ceramic'] },
  { categorySlug: 'home-and-kitchen', brandName: 'Cello',   basePrice: 3490,  title: 'Pressure Cooker 5L',              tags: ['cooker', 'kitchen'] },
  { categorySlug: 'home-and-kitchen', brandName: 'IKEA',    basePrice: 4990,  title: 'FADO Table Lamp',                 tags: ['lamp', 'lighting'] },
  { categorySlug: 'home-and-kitchen', brandName: 'IKEA',    basePrice: 15990, title: 'KIVIK 3-Seater Sofa',             tags: ['sofa', 'living'] },
  { categorySlug: 'home-and-kitchen', brandName: 'Cello',   basePrice: 2490,  title: 'Non-Stick Cookware Set',          tags: ['cookware', 'non-stick'] },
  { categorySlug: 'home-and-kitchen', brandName: 'IKEA',    basePrice: 1290,  title: 'RAGGISAR Trash Bin',              tags: ['bin', 'bathroom'] },
  { categorySlug: 'home-and-kitchen', brandName: 'IKEA',    basePrice: 22990, title: 'BEAUTUD Mattress',                tags: ['mattress', 'bedroom'] },
  { categorySlug: 'home-and-kitchen', brandName: 'Cello',   basePrice: 3990,  title: 'Mixing Grinder 750W',             tags: ['grinder', 'kitchen'] },
  { categorySlug: 'home-and-kitchen', brandName: 'IKEA',    basePrice: 3990,  title: 'POÄNG Armchair',                  tags: ['armchair', 'living'] },
  { categorySlug: 'home-and-kitchen', brandName: 'Cello',   basePrice: 1490,  title: 'Storage Container Set',            tags: ['storage', 'kitchen'] },

  // Beauty — 10 items
  { categorySlug: 'beauty', brandName: 'Lakme',       basePrice: 650,  title: 'Absolute Skin Gloss Foundation',  tags: ['foundation', 'makeup'] },
  { categorySlug: 'beauty', brandName: 'Maybelline',  basePrice: 549,  title: 'Fit Me Matte + Poreless Foundation', tags: ['foundation', 'matte'] },
  { categorySlug: 'beauty', brandName: "L'Oreal",     basePrice: 899,  title: 'Total Repair 5 Shampoo',          tags: ['shampoo', 'haircare'] },
  { categorySlug: 'beauty', brandName: 'Lakme',       basePrice: 1450, title: 'Absolute Hydra Primer',           tags: ['primer', 'makeup'] },
  { categorySlug: 'beauty', brandName: 'Maybelline',  basePrice: 699,  title: 'Lash Sensational Mascara',        tags: ['mascara', 'eye'] },
  { categorySlug: 'beauty', brandName: "L'Oreal",     basePrice: 1099, title: 'Hyaluronic Acid Serum',           tags: ['serum', 'skincare'] },
  { categorySlug: 'beauty', brandName: 'Lakme',       basePrice: 449,  title: 'Eyeconic Kajal Pencil',           tags: ['kajal', 'eye'] },
  { categorySlug: 'beauty', brandName: 'Maybelline',  basePrice: 399,  title: 'ColorSensational Lipstick',       tags: ['lipstick', 'color'] },
  { categorySlug: 'beauty', brandName: "L'Oreal",     basePrice: 749,  title: 'EverPure Conditioner',            tags: ['conditioner', 'hair'] },
  { categorySlug: 'beauty', brandName: 'Lakme',       basePrice: 999,  title: 'Sun Expert SPF 50 Sunscreen',     tags: ['sunscreen', 'spf'] },

  // Accessories — 6 items
  { categorySlug: 'accessories', brandName: 'Fossil',  basePrice: 1799, title: 'Leather Belt',                    tags: ['belt', 'leather'] },
  { categorySlug: 'accessories', brandName: 'Fossil',  basePrice: 1299, title: 'Aviator Sunglasses',              tags: ['sunglasses', 'uv'] },
  { categorySlug: 'accessories', brandName: 'Fossil',  basePrice: 999,  title: 'Cotton Scarf',                    tags: ['scarf', 'winter'] },
  { categorySlug: 'accessories', brandName: 'Fossil',  basePrice: 1499, title: 'Canvas Wallet',                   tags: ['wallet', 'casual'] },
  { categorySlug: 'accessories', brandName: 'Fossil',  basePrice: 2299, title: 'Bifold Cardholder',               tags: ['wallet', 'cardholder'] },
  { categorySlug: 'accessories', brandName: 'Fossil',  basePrice: 1899, title: 'Knit Beanie',                     tags: ['beanie', 'winter'] },

  // Bags & Backpacks — 6 items
  { categorySlug: 'bags-and-backpacks', brandName: 'Wildcraft', basePrice: 1999, title: 'Trekking Backpack 45L',     tags: ['trekking', 'travel'] },
  { categorySlug: 'bags-and-backpacks', brandName: 'Wildcraft', basePrice: 1299, title: 'Laptop Backpack',           tags: ['laptop', 'commute'] },
  { categorySlug: 'bags-and-backpacks', brandName: 'Fossil',    basePrice: 3999, title: 'Gen 6 Crossbody',          tags: ['crossbody', 'leather'] },
  { categorySlug: 'bags-and-backpacks', brandName: 'Wildcraft', basePrice: 2499, title: 'Duffel Bag 50L',           tags: ['duffel', 'travel'] },
  { categorySlug: 'bags-and-backpacks', brandName: 'Fossil',    basePrice: 5499, title: 'Leather Tote',             tags: ['tote', 'leather'] },
  { categorySlug: 'bags-and-backpacks', brandName: 'Wildcraft', basePrice: 999,  title: 'Sling Pouch',              tags: ['sling', 'compact'] },

  // Watches — 8 items
  { categorySlug: 'watches', brandName: 'Casio', basePrice: 1499, title: 'G-Shock GA-2100',           tags: ['g-shock', 'rugged'] },
  { categorySlug: 'watches', brandName: 'Casio', basePrice: 999,  title: 'Vintage A158',              tags: ['vintage', 'digital'] },
  { categorySlug: 'watches', brandName: 'Fossil', basePrice: 6999, title: 'Gen 5 Smartwatch',          tags: ['smartwatch', 'wear'] },
  { categorySlug: 'watches', brandName: 'Timex', basePrice: 2499, title: 'Waterbury Traditional',     tags: ['analog', 'classic'] },
  { categorySlug: 'watches', brandName: 'Casio', basePrice: 4499, title: 'Edifice EFR-S108D',         tags: ['chronograph', 'steel'] },
  { categorySlug: 'watches', brandName: 'Fossil', basePrice: 5499, title: 'Grant Chronograph',         tags: ['chronograph', 'leather'] },
  { categorySlug: 'watches', brandName: 'Timex', basePrice: 1899, title: 'Weekender',                 tags: ['weekender', 'strap'] },
  { categorySlug: 'watches', brandName: 'Noise', basePrice: 1599, title: 'Pulse 2 Max',               tags: ['smartwatch', 'amoled'] },

  // Sports & Outdoors — 8 items
  { categorySlug: 'sports-and-outdoors', brandName: 'Nike',    basePrice: 1499, title: 'Football Size 5',          tags: ['football', 'training'] },
  { categorySlug: 'sports-and-outdoors', brandName: 'Adidas',  basePrice: 2999, title: 'Yoga Mat 6mm',             tags: ['yoga', 'mat'] },
  { categorySlug: 'sports-and-outdoors', brandName: 'Wildcraft', basePrice: 4999, title: '2-Person Tent',          tags: ['camping', 'tent'] },
  { categorySlug: 'sports-and-outdoors', brandName: 'Nike',    basePrice: 1999, title: 'Resistance Band Set',      tags: ['resistance', 'fitness'] },
  { categorySlug: 'sports-and-outdoors', brandName: 'Adidas',  basePrice: 1299, title: 'Cycling Gloves',           tags: ['cycling', 'gloves'] },
  { categorySlug: 'sports-and-outdoors', brandName: 'Reebok',  basePrice: 4499, title: 'Speed Rope',               tags: ['rope', 'cardio'] },
  { categorySlug: 'sports-and-outdoors', brandName: 'Wildcraft', basePrice: 1799, title: 'Sleeping Bag',           tags: ['camping', 'sleep'] },
  { categorySlug: 'sports-and-outdoors', brandName: 'Puma',    basePrice: 2199, title: 'Running Belt',             tags: ['running', 'belt'] },

  // Books — 6 items
  { categorySlug: 'books', brandName: 'Penguin', basePrice: 399, title: 'The Alchemist',                 tags: ['fiction', 'classic'] },
  { categorySlug: 'books', brandName: 'Penguin', basePrice: 499, title: 'Sapiens',                        tags: ['history', 'nonfiction'] },
  { categorySlug: 'books', brandName: 'Penguin', basePrice: 350, title: 'Ikigai',                         tags: ['self-help', 'philosophy'] },
  { categorySlug: 'books', brandName: 'Penguin', basePrice: 599, title: 'Atomic Habits',                  tags: ['habits', 'productivity'] },
  { categorySlug: 'books', brandName: 'Penguin', basePrice: 450, title: '1984',                           tags: ['dystopian', 'classic'] },
  { categorySlug: 'books', brandName: 'Penguin', basePrice: 550, title: 'To Kill a Mockingbird',          tags: ['classic', 'fiction'] },

  // Toys & Games — 6 items
  { categorySlug: 'toys-and-games', brandName: 'Lego', basePrice: 1499, title: 'Classic Bricks 484-Piece Set',  tags: ['lego', 'building'] },
  { categorySlug: 'toys-and-games', brandName: 'Lego', basePrice: 2999, title: 'City Police Station',           tags: ['city', 'police'] },
  { categorySlug: 'toys-and-games', brandName: 'Lego', basePrice: 4499, title: 'Technic Porsche 911',           tags: ['technic', 'model'] },
  { categorySlug: 'toys-and-games', brandName: 'Lego', basePrice: 1999, title: 'Creator 3-in-1 Space Astronaut', tags: ['creator', 'space'] },
  { categorySlug: 'toys-and-games', brandName: 'Lego', basePrice: 999,  title: 'Duplo Number Train',            tags: ['duplo', 'toddler'] },
  { categorySlug: 'toys-and-games', brandName: 'Lego', basePrice: 1299, title: 'Friends Heartlake Bakery',      tags: ['friends', 'baking'] },

  // Jewelry — 6 items
  { categorySlug: 'jewelry', brandName: 'Fossil', basePrice: 1999, title: 'Vintage Pendant Necklace',       tags: ['necklace', 'vintage'] },
  { categorySlug: 'jewelry', brandName: 'Fossil', basePrice: 1499, title: 'Tear Drop Earrings',             tags: ['earrings', 'silver'] },
  { categorySlug: 'jewelry', brandName: 'Fossil', basePrice: 2499, title: 'Stackable Ring Set',             tags: ['rings', 'stackable'] },
  { categorySlug: 'jewelry', brandName: 'Fossil', basePrice: 1799, title: 'Beaded Bracelet',                tags: ['bracelet', 'beaded'] },
  { categorySlug: 'jewelry', brandName: 'Fossil', basePrice: 1299, title: 'Cufflinks',                      tags: ['cufflinks', 'formal'] },
  { categorySlug: 'jewelry', brandName: 'Fossil', basePrice: 999,  title: 'Charm Anklet',                   tags: ['anklet', 'charm'] },

  // Health & Personal Care — 6 items
  { categorySlug: 'health-and-personal-care', brandName: "L'Oreal", basePrice: 499,  title: 'Castor Oil 100ml',     tags: ['oil', 'haircare'] },
  { categorySlug: 'health-and-personal-care', brandName: 'Lakme',    basePrice: 299,  title: 'Cleansing Milk',      tags: ['cleanser', 'skincare'] },
  { categorySlug: 'health-and-personal-care', brandName: 'Maybelline', basePrice: 349, title: 'Baby Lips Lip Balm',  tags: ['lipbalm', 'moisturize'] },
  { categorySlug: 'health-and-personal-care', brandName: "L'Oreal", basePrice: 599,  title: 'Foot Cream',          tags: ['foot', 'cream'] },
  { categorySlug: 'health-and-personal-care', brandName: 'Lakme',    basePrice: 549,  title: 'Face Wash Oily Skin', tags: ['facewash', 'oil'] },
  { categorySlug: 'health-and-personal-care', brandName: "L'Oreal", basePrice: 449,  title: 'Hair Spa Mask',       tags: ['mask', 'haircare'] },

  // Pet Supplies — 4 items
  { categorySlug: 'pet-supplies', brandName: 'Wildcraft', basePrice: 999,  title: 'Reflective Dog Leash', tags: ['dog', 'leash'] },
  { categorySlug: 'pet-supplies', brandName: 'Wildcraft', basePrice: 1499, title: 'Pet Travel Bowl',     tags: ['dog', 'bowl'] },
  { categorySlug: 'pet-supplies', brandName: 'Cello',     basePrice: 599,  title: 'Cat Toy Ball',        tags: ['cat', 'toy'] },
  { categorySlug: 'pet-supplies', brandName: 'Wildcraft', basePrice: 1999, title: 'Pet Carrier Backpack', tags: ['cat', 'carrier'] },

  // Office Supplies — 6 items
  { categorySlug: 'office-supplies', brandName: 'Faber-Castell', basePrice: 299,  title: '48 Color Pencil Set', tags: ['colored', 'art'] },
  { categorySlug: 'office-supplies', brandName: 'Faber-Castell', basePrice: 199,  title: 'Goldfaber Sketch Pen', tags: ['sketch', 'ink'] },
  { categorySlug: 'office-supplies', brandName: 'Faber-Castell', basePrice: 499,  title: 'A4 Notebook Hardcover', tags: ['notebook', 'a4'] },
  { categorySlug: 'office-supplies', brandName: 'Faber-Castell', basePrice: 349,  title: 'Eraser Set 12-Piece',  tags: ['eraser', 'studio'] },
  { categorySlug: 'office-supplies', brandName: 'Faber-Castell', basePrice: 599,  title: 'Drafting Pencil Set',  tags: ['drafting', 'pencil'] },
  { categorySlug: 'office-supplies', brandName: 'Faber-Castell', basePrice: 249,  title: 'Highlighter Pack 10',  tags: ['highlighter', 'office'] },
];

// Keep the reset catalog intentionally small and broad enough to exercise
// category, brand, product and Amazon-style variant pricing screens.
const SEED_PRODUCT_TITLES = new Set([
  'Dri-FIT Running T-Shirt', 'Essentials Hoodie', '511 Slim Fit Jeans',
  'Air Zoom Pegasus 40', 'Suede Classic XXI', 'Stan Smith',
  'Galaxy A55 5G', 'iPhone 15', 'WH-1000XM5 Headphones', 'MacBook Air M3', 'ColorFit Pulse 2 Max',
  'BILLY Bookcase', 'Dinnerware Set 16-Piece', 'Pressure Cooker 5L', 'FADO Table Lamp',
  'Absolute Skin Gloss Foundation', 'Fit Me Matte + Poreless Foundation', 'Hyaluronic Acid Serum', 'Sun Expert SPF 50 Sunscreen',
  'Leather Belt', 'Aviator Sunglasses', 'Canvas Wallet',
  'G-Shock GA-2100', 'Waterbury Traditional', 'Highlighter Pack 10',
]);

const VARIANT_CONFIGS = {
  'Dri-FIT Running T-Shirt': {
    name: 'Color',
    options: [
      { value: 'Black', price: 1999, comparePrice: 2499, imageIndex: 0 },
      { value: 'Blue', price: 2099, comparePrice: 2699, imageIndex: 1 },
      { value: 'White', price: 1899, comparePrice: 2399, imageIndex: 2 },
    ],
  },
  'Air Zoom Pegasus 40': {
    name: 'Size',
    options: [
      { value: 'UK 7', price: 5999, comparePrice: 6999, imageIndex: 0 },
      { value: 'UK 8', price: 6199, comparePrice: 7299, imageIndex: 1 },
      { value: 'UK 9', price: 5999, comparePrice: 6999, imageIndex: 2 },
    ],
  },
  'iPhone 15': {
    name: 'Storage',
    options: [
      { value: '128 GB', price: 69900, comparePrice: 79900, imageIndex: 0 },
      { value: '256 GB', price: 79900, comparePrice: 89900, imageIndex: 1 },
    ],
  },
  'BILLY Bookcase': {
    name: 'Finish',
    options: [
      { value: 'White', price: 12990, comparePrice: 14990, imageIndex: 0 },
      { value: 'Oak', price: 13990, comparePrice: 15990, imageIndex: 1 },
    ],
  },
  'G-Shock GA-2100': {
    name: 'Color',
    options: [
      { value: 'Black', price: 1499, comparePrice: 1999, imageIndex: 0 },
      { value: 'Red', price: 1599, comparePrice: 2199, imageIndex: 1 },
    ],
  },
  'Highlighter Pack 10': {
    name: 'Pack',
    options: [
      { value: '10 Colors', price: 249, comparePrice: 349, imageIndex: 0 },
      { value: '20 Colors', price: 399, comparePrice: 499, imageIndex: 1 },
    ],
  },
};

async function dropIfExists(Model) {
  const name = Model.collection.name;
  const exists = await mongoose.connection.db.listCollections({ name }).hasNext();
  if (!exists) return;
  const count = await Model.countDocuments();
  console.log(`Dropping ${count} existing ${name}`);
  await Model.collection.drop();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSku(index) {
  return `DUMMY-${String(index + 1).padStart(5, '0')}`;
}

function pickImages(categorySlug, brandName, title, count) {
  const pool = UNSPLASH_BY_CATEGORY[categorySlug] || [];
  if (pool.length === 0) return [];
  const seed = (brandName + title).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (seed * (i + 7)) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  return picked.map((id, idx) => ({
    url: `https://images.unsplash.com/photo-${id}?w=800`,
    alt: `${brandName} ${title}`,
  }));
}

function buildProductDoc(template, index, categoryMap, brandNames, vendorId) {
  const imagesCount = randInt(3, 5);
  const images = pickImages(template.categorySlug, template.brandName, template.title, imagesCount);
  const hasCompare = Math.random() < 0.3;
  const comparePrice = hasCompare
    ? Math.round((template.basePrice * (1 + (randInt(10, 30) / 100))) / 10) * 10
    : undefined;
  const variantConfig = VARIANT_CONFIGS[template.title];
  const variants = variantConfig ? [{
    name: variantConfig.name,
    options: variantConfig.options.map((option) => {
      const optionImages = images.length ? [images[option.imageIndex % images.length]] : [];
      return {
        value: option.value,
        stock: randInt(8, 80),
        price: option.price,
        comparePrice: option.comparePrice,
        discount: Math.round(((option.comparePrice - option.price) / option.comparePrice) * 100),
        images: optionImages,
        thumbnail: optionImages[0]?.url,
      };
    }),
  }] : [];
  return {
    title: template.title,
    slug: slugify(`${template.brandName}-${template.title}`, { lower: true, strict: true }),
    description: `${template.title} by ${template.brandName}. A premium pick from our catalog -- built for daily use and great value at this price point. Ships across India.`,
    shortDescription: `${template.brandName} ${template.title}. Ships fast across India.`,
    price: template.basePrice,
    comparePrice,
    discount: comparePrice ? Math.round(((comparePrice - template.basePrice) / comparePrice) * 100) : 0,
    images,
    thumbnail: images[0]?.url,
    category: categoryMap[template.categorySlug],
    brand: template.brandName,
    sku: generateSku(index),
    stock: randInt(12, 150),
    lowStockThreshold: 10,
    tags: template.tags,
    isActive: true,
    isFeatured: Math.random() < 0.1,
    ratings: { average: Math.round((randInt(30, 49) / 10) * 10) / 10, count: randInt(0, 500) },
    seo: {
      metaTitle: `${template.title} ${template.brandName} ${PLATFORM_NAME}`,
      metaDescription: `Shop ${template.brandName} ${template.title}. Fast delivery across India. Easy returns.`,
      keywords: [template.brandName, template.title],
    },
    vendor: vendorId,
    variants,
  };
}

async function seedCategories() {
  const docs = CATEGORIES.map(c => ({
    ...c,
    slug: slugify(c.name, { lower: true, strict: true }),
    isActive: true,
  }));
  await dropIfExists(Category);
  const inserted = [];
  for (const doc of docs) {
    try {
      const r = await Category.create(doc);
      inserted.push(r);
    } catch (e) {
      console.error(`Category insert failed for "${doc.name}": ${e.message}`);
    }
  }
  console.log(`Categories seeded: ${inserted.length}`);
  return inserted;
}

async function seedBrands() {
  const docs = BRANDS.map(b => ({
    ...b,
    slug: slugify(b.name, { lower: true, strict: true }),
    isActive: true,
  }));
  await dropIfExists(Brand);
  const inserted = [];
  for (const doc of docs) {
    try {
      const r = await Brand.create(doc);
      inserted.push(r);
    } catch (e) {
      console.error(`Brand insert failed for "${doc.name}": ${e.message}`);
    }
  }
  console.log(`Brands seeded: ${inserted.length}`);
  return inserted;
}

async function seedProducts(categoryDocs, vendorId) {
  const categoryMap = categoryDocs.reduce((acc, c) => {
    acc[c.slug] = c._id;
    return acc;
  }, {});
  const brandNames = new Set(BRANDS.map(b => b.name));
  await dropIfExists(Product);
  const docs = [];
  let skipped = 0;
  const templates = PRODUCT_TEMPLATES.filter(t => SEED_PRODUCT_TITLES.has(t.title));
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (!categoryMap[t.categorySlug]) { skipped++; continue; }
    if (!brandNames.has(t.brandName)) { skipped++; continue; }
    docs.push(buildProductDoc(t, i, categoryMap, brandNames, vendorId));
  }
  if (templates.length !== 25) throw new Error(`Expected 25 seed products, found ${templates.length}`);
  const inserted = [];
  let failed = 0;
  for (const doc of docs) {
    try {
      const r = await Product.create(doc);
      inserted.push(r);
    } catch (e) {
      failed++;
      console.error(`Product insert failed for "${doc.title}": ${e.message}`);
    }
  }
  if (skipped > 0) console.log(`Skipped ${skipped} templates (missing category or brand)`);
  if (failed > 0) console.log(`Failed: ${failed} products`);
  console.log(`Products seeded: ${inserted.length}`);
  return inserted;
}

async function main() {
  if (!MONGO_URI) {
    console.error('No MONGO_URI configured. Set MONGO_URI or MONGO_URI_SEED in .env');
    process.exit(1);
  }
  console.log(`Connecting to MongoDB…`);
  await mongoose.connect(MONGO_URI);
  if (!MONGO_URI) {
    console.error('No MONGO_URI configured. Set MONGO_URI or MONGO_URI_SEED in .env');
    process.exit(1);
  }
  console.log(`Connected to: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const categories = await seedCategories();
  await seedBrands();

  let vendorId = null;
  const tatoz = await Vendor.findOne({ slug: 'tatoz-official' });
  if (tatoz) {
    vendorId = tatoz._id;
    console.log(`Linked products to vendor: ${PLATFORM_NAME} Official (${vendorId})`);
  } else {
    console.log('No tatoz-official vendor found — products will have vendor: null');
  }

  const seededProducts = await seedProducts(categories, vendorId);
  if (vendorId) {
    await Vendor.findByIdAndUpdate(vendorId, {
      $set: {
        'stats.totalProducts': seededProducts.length,
        'stats.activeProducts': seededProducts.filter(product => product.isActive).length,
      },
    });
    console.log(`Vendor stats updated: ${seededProducts.length} total products`);
  }

  const sample = await Product.findOne().populate('category', 'name slug');
  console.log('--- Verification ---');
  console.log(`Categories seeded: ${categories.length}`);
  console.log(`Products seeded:   ${await Product.countDocuments()}`);
  if (sample) {
    console.log(`Sample product:    ${sample.title}`);
    console.log(`  category:        ${sample.category ? sample.category.name : 'unset'}`);
    console.log(`  brand:           ${sample.brand}`);
    console.log(`  images:          ${sample.images.length}`);
  }

  console.log('🎉 Dummy product seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
