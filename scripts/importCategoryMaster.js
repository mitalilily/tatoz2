require('dotenv').config();
const path = require('path');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Tenant = require('../models/Tenant');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { createUniqueCategorySlug } = require('../utils/slugify');
const { CATEGORY_LEVELS, levelForDepth } = require('../services/categoryHierarchyService');

const DEFAULT_FILE = path.join(process.cwd(), 'TATOZ_CATEGORY_MASTER_4_LEVEL.xlsx');
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const keyPart = value => clean(value).normalize('NFKC').toLowerCase().replace(/[’']/g, "'");
const pathKey = parts => parts.map(keyPart).join('|');
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const argValue = name => {
  const match = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : '';
};

const requestedFile = argValue('file') || process.env.CATEGORY_MASTER_FILE || DEFAULT_FILE;
const apply = process.argv.includes('--apply');
const tenantKey = (argValue('tenant') || process.env.CATEGORY_MASTER_TENANT || 'platform').trim().toLowerCase();

const cellText = cell => clean(cell?.text ?? cell?.value);

const readMaster = async file => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const taxonomy = workbook.getWorksheet('TATOZ 4-Level Taxonomy') || workbook.worksheets[0];
  if (!taxonomy) throw new Error('The workbook does not contain a taxonomy sheet');

  const header = new Map();
  taxonomy.getRow(1).eachCell((cell, column) => { header.set(cellText(cell).toLowerCase(), column); });
  const columns = ['menu', 'sub menu', 'category', 'sub category'];
  if (columns.some(column => !header.has(column))) throw new Error(`Taxonomy sheet must contain: ${columns.join(', ')}`);

  const sourceCodes = new Map();
  const mapping = workbook.getWorksheet('Source Mapping');
  if (mapping) {
    const mappingHeader = new Map();
    mapping.getRow(1).eachCell((cell, column) => { mappingHeader.set(cellText(cell).toLowerCase(), column); });
    for (let rowNumber = 2; rowNumber <= mapping.rowCount; rowNumber += 1) {
      const row = mapping.getRow(rowNumber);
      const parts = ['menu', 'sub menu', 'category'].map(name => cellText(row.getCell(mappingHeader.get(name))));
      const code = cellText(row.getCell(mappingHeader.get('category id')));
      if (parts.every(Boolean) && code) sourceCodes.set(pathKey(parts), code);
    }
  }

  const nodes = new Map();
  const siblingOrders = new Map();
  let validRows = 0;
  for (let rowNumber = 2; rowNumber <= taxonomy.rowCount; rowNumber += 1) {
    const row = taxonomy.getRow(rowNumber);
    const names = columns.map(column => cellText(row.getCell(header.get(column))));
    if (!names.every(Boolean)) continue;
    validRows += 1;
    for (let depth = 0; depth < names.length; depth += 1) {
      const parts = names.slice(0, depth + 1);
      const key = pathKey(parts);
      if (nodes.has(key)) continue;
      const parentKey = depth ? pathKey(parts.slice(0, -1)) : '';
      const siblingKey = parentKey || '__root__';
      const order = siblingOrders.get(siblingKey) || 0;
      siblingOrders.set(siblingKey, order + 1);
      nodes.set(key, {
        key,
        name: names[depth],
        depth,
        level: levelForDepth(depth),
        parentKey,
        order,
        masterCode: depth === 2 ? sourceCodes.get(key) : undefined,
      });
    }
  }
  if (!validRows) throw new Error('The taxonomy sheet contains no valid 4-level rows');
  return { nodes: [...nodes.values()], validRows, sourceCodes: sourceCodes.size };
};

const resolveTenant = async () => {
  const query = mongoose.isValidObjectId(tenantKey)
    ? { _id: tenantKey }
    : { $or: [{ key: tenantKey }, { slug: tenantKey }] };
  const tenant = await Tenant.findOne({ ...query, status: { $ne: 'archived' } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantKey}`);
  return tenant;
};

const sameNameQuery = (name, parentId, tenantId) => ({
  tenant: tenantId,
  name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  parent: parentId || null,
});

const ensureNode = async ({ node, parent, tenant, imported }) => {
  const metadata = {
    name: node.name,
    parent: parent?._id || null,
    level: node.level,
    depth: node.depth,
    ancestors: parent ? [...(parent.ancestors || []), parent._id] : [],
    order: node.order,
    isActive: true,
    isLegacy: false,
  };
  if (node.masterCode) metadata.masterCode = node.masterCode;

  let category = await Category.findOne({ tenant: tenant._id, masterKey: node.key });
  if (!category) category = await Category.findOne(sameNameQuery(node.name, metadata.parent, tenant._id));
  if (category) {
    category = await Category.findByIdAndUpdate(category._id, { $set: { ...metadata, masterKey: node.key } }, { new: true, runValidators: true });
  } else {
    const slug = await createUniqueCategorySlug(node.name);
    category = await Category.create({ ...metadata, masterKey: node.key, slug, tenant: tenant._id, commissionRate: 10 });
  }
  imported.set(node.key, category);
  return category;
};

const ensurePath = async ({ names, tenant, imported, legacyKey }) => {
  let parent = null;
  const parts = [];
  for (let depth = 0; depth < names.length; depth += 1) {
    parts.push(names[depth]);
    const canonical = imported.get(pathKey(parts));
    if (canonical) {
      parent = canonical;
      continue;
    }
    const key = legacyKey ? `${legacyKey}|${pathKey(parts)}` : pathKey(parts);
    const node = { key, name: names[depth], depth, level: levelForDepth(depth), parentKey: parent ? parent.masterKey : '', order: 9000 + depth };
    parent = await ensureNode({ node, parent, tenant, imported });
  }
  return parent;
};

const legacyTargetPath = (categoryName, productTitle = '') => {
  const category = keyPart(categoryName);
  const title = keyPart(productTitle);
  if (category === 'kitchen faucets' || title.includes('faucet')) return ['Home & Kitchen', 'Kitchen Fixtures', 'Kitchen Faucets', 'Taps & Mixers'];
  if (category === 'bathroom vanities' || title.includes('bathroom vanity') || title.includes('vanity')) return ['Furniture', 'Bathroom Furniture', 'Bathroom Vanities', 'Bathroom Vanity Units'];
  if (category === 'health & personal care' || title.includes('protein')) return ['Health & Wellness', 'Nutrition', 'Protein & Supplements', 'Protein Powders'];
  if (category === 'home & kitchen') return ['Home & Kitchen', 'Other Home & Kitchen', 'General Home & Kitchen', 'Other Home & Kitchen'];
  return ['Home & Kitchen', 'Other', 'Other Products', 'Unclassified Products'];
};

const deactivateLegacyCategories = async ({ tenant, imported }) => {
  const importedIds = [...imported.values()].map(category => category._id);
  const legacy = await Category.find({
    $or: [{ tenant: tenant._id }, { tenant: null }, { tenant: { $exists: false } }],
    _id: { $nin: importedIds },
  }).select('_id name slug tenant isActive').lean();
  const report = { legacyCategories: legacy.length, remappedProducts: 0, deactivatedCategories: 0, legacyPaths: 0 };

  for (const oldCategory of legacy) {
    const products = await Product.find({ category: oldCategory._id }).select('_id title tenant').lean();
    for (const product of products) {
      const targetPath = legacyTargetPath(oldCategory.name, product.title);
      const target = await ensurePath({ names: targetPath, tenant, imported, legacyKey: `legacy:${pathKey([oldCategory.name])}` });
      await Product.updateOne({ _id: product._id }, { $set: { category: target._id, tenant: product.tenant || tenant._id } });
      report.remappedProducts += 1;
    }
    await Category.updateOne({ _id: oldCategory._id }, {
      $set: {
        tenant: oldCategory.tenant || tenant._id,
        isActive: false,
        isLegacy: true,
        masterKey: `legacy:${keyPart(oldCategory.name)}:${oldCategory._id}`,
        level: 'menu',
        depth: 0,
        ancestors: [],
      },
      $unset: { masterCode: 1 },
    });
    report.deactivatedCategories += 1;
    if (products.length) report.legacyPaths += 1;
  }
  return report;
};

const remapImportedProductsToLeaves = async ({ tenant, imported }) => {
  const categoryIds = [...imported.values()].map(category => category._id);
  const products = await Product.find({ tenant: tenant._id, category: { $in: categoryIds } })
    .select('_id title category')
    .populate('category', 'name')
    .lean();
  let remapped = 0;
  for (const product of products) {
    const categoryName = product.category?.name || '';
    const title = keyPart(product.title);
    if (keyPart(categoryName) !== 'home & kitchen' || (!title.includes('vanity') && !title.includes('faucet'))) continue;
    const target = await ensurePath({
      names: legacyTargetPath(categoryName, product.title),
      tenant,
      imported,
      legacyKey: 'legacy:home-and-kitchen-products',
    });
    if (String(product.category?._id) !== String(target._id)) {
      await Product.updateOne({ _id: product._id }, { $set: { category: target._id } });
      remapped += 1;
    }
  }
  return remapped;
};

const run = async () => {
  const master = await readMaster(requestedFile);
  await connectDB();
  const tenant = await resolveTenant();
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    file: requestedFile,
    tenant: { id: String(tenant._id), key: tenant.key, name: tenant.name },
    taxonomyRows: master.validRows,
    nodes: master.nodes.length,
    sourceCodes: master.sourceCodes,
    byLevel: Object.fromEntries(CATEGORY_LEVELS.map(level => [level, master.nodes.filter(node => node.level === level).length])),
  };

  if (apply) {
    const imported = new Map();
    for (const node of master.nodes) {
      const parent = node.parentKey ? imported.get(node.parentKey) : null;
      if (node.parentKey && !parent) throw new Error(`Parent node was not created for ${node.key}`);
      await ensureNode({ node, parent, tenant, imported });
    }
    const legacyReport = await deactivateLegacyCategories({ tenant, imported });
    report.migration = { ...legacyReport, remappedImportedProducts: await remapImportedProductsToLeaves({ tenant, imported }) };
    report.activeCategories = await Category.countDocuments({ tenant: tenant._id, isActive: true });
    report.maxDepth = await Category.findOne({ tenant: tenant._id, isActive: true }).sort({ depth: -1 }).select('depth').lean().then(row => row?.depth ?? 0);
  }
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
};

if (require.main === module) {
  run().catch(async error => {
    console.error(error.stack || error.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { readMaster, legacyTargetPath, run };
