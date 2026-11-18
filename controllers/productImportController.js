const asyncHandler = require('express-async-handler');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const slugify = require('slugify');
const { tenantScope } = require('../services/adminTenantScope');

const CSV_HEADERS = ['Title', 'SKU', 'Description', 'Price', 'Compare Price', 'Discount %', 'Stock', 'Category', 'Brand', 'Tags', 'Active'];

const tenantFilter = req => tenantScope(req);

// @desc    Export all products as CSV
// @route   GET /api/admin/products/export
const exportProducts = asyncHandler(async (req, res) => {
  const products = await Product.find(tenantFilter(req))
    .populate('category', 'name')
    .populate('brand', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');

  sheet.columns = [
    { header: 'Title', key: 'title', width: 40 },
    { header: 'SKU', key: 'sku', width: 15 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Price', key: 'price', width: 12 },
    { header: 'Compare Price', key: 'comparePrice', width: 15 },
    { header: 'Discount %', key: 'discount', width: 12 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Brand', key: 'brand', width: 20 },
    { header: 'Tags', key: 'tags', width: 30 },
    { header: 'Active', key: 'isActive', width: 10 },
  ];

  // Bold header
  sheet.getRow(1).font = { bold: true };

  for (const p of products) {
    sheet.addRow({
      title: p.title,
      sku: p.sku || '',
      description: (p.description || '').substring(0, 500),
      price: p.price,
      comparePrice: p.comparePrice || '',
      discount: p.discount || 0,
      stock: p.stock,
      category: p.category?.name || '',
      brand: p.brand?.name || '',
      tags: (p.tags || []).join(', '),
      isActive: p.isActive ? 'true' : 'false',
    });
  }

  const buffer = await workbook.csv.writeBuffer();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="products-export-${Date.now()}.csv"`);
  res.send(buffer);
});

// @desc    Download CSV template
// @route   GET /api/admin/products/import-template
const downloadTemplate = asyncHandler(async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  sheet.addRow(CSV_HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(['Example Product', 'SKU001', 'A great product description', '999', '1299', '23', '50', 'Electronics', 'BrandName', 'tag1, tag2, tag3', 'true']);

  const buffer = await workbook.csv.writeBuffer();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products-import-template.csv"');
  res.send(buffer);
});

// @desc    Import products from CSV
// @route   POST /api/admin/products/import
const importProducts = asyncHandler(async (req, res) => {
  if (!req.file) { res.status(400); throw new Error('CSV file is required'); }

  const workbook = new ExcelJS.Workbook();
  await workbook.csv.read(Readable.from(req.file.buffer));
  const sheet = workbook.worksheets[0];
  if (!sheet) { res.status(400); throw new Error('Empty CSV file'); }

  // Cache categories and brands by name
  const scope = tenantFilter(req);
  const categories = await Category.find(scope).lean();
  const brands = await Brand.find(scope).lean();
  const catMap = {};
  categories.forEach(c => { catMap[c.name.toLowerCase()] = c._id; });
  const brandMap = {};
  brands.forEach(b => { brandMap[b.name.toLowerCase()] = b._id; });

  const results = { created: 0, updated: 0, errors: [] };
  const rows = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    rows.push({ rowNumber, values: row.values });
  });

  for (const { rowNumber, values } of rows) {
    try {
      // values[0] is empty (1-indexed), so values[1] = Title, etc.
      const title = String(values[1] || '').trim();
      if (!title) { results.errors.push({ row: rowNumber, message: 'Title is required' }); continue; }

      const sku = String(values[2] || '').trim();
      const description = String(values[3] || '').trim();
      const price = parseFloat(values[4]) || 0;
      if (price <= 0) { results.errors.push({ row: rowNumber, message: 'Price must be positive' }); continue; }

      const comparePrice = parseFloat(values[5]) || 0;
      const discount = parseFloat(values[6]) || 0;
      const stock = parseInt(values[7]) || 0;
      const categoryName = String(values[8] || '').trim().toLowerCase();
      const brandName = String(values[9] || '').trim().toLowerCase();
      const tags = String(values[10] || '').split(',').map(t => t.trim()).filter(Boolean);
      const isActive = String(values[11] || 'true').toLowerCase() !== 'false';

      const categoryId = catMap[categoryName];
      if (!categoryId && categoryName) {
        results.errors.push({ row: rowNumber, message: `Category "${values[8]}" not found` });
        continue;
      }

      const brandId = brandMap[brandName] || null;
      const slug = slugify(title, { lower: true, strict: true }) + '-' + Date.now().toString(36).slice(-4);

      // Check existing by SKU or title
      const existing = sku
        ? await Product.findOne({ sku, ...scope })
        : await Product.findOne({ title, ...scope });

      if (existing) {
        // Update
        existing.description = description || existing.description;
        existing.price = price;
        if (comparePrice) existing.comparePrice = comparePrice;
        existing.discount = discount;
        existing.stock = stock;
        if (categoryId) existing.category = categoryId;
        if (brandId) existing.brand = brandId;
        if (tags.length) existing.tags = tags;
        existing.isActive = isActive;
        await existing.save();
        results.updated++;
      } else {
        // Create
        if (!categoryId) { results.errors.push({ row: rowNumber, message: 'Category is required for new products' }); continue; }
        await Product.create({
          title, slug, sku, description, price, comparePrice, discount, stock,
          category: categoryId, brand: brandId, tags, isActive, ...scope,
        });
        results.created++;
      }
    } catch (err) {
      results.errors.push({ row: rowNumber, message: err.message });
    }
  }

  res.json({ success: true, ...results });
});

module.exports = { exportProducts, downloadTemplate, importProducts };
