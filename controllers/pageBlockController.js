const asyncHandler = require('express-async-handler');
const PageBlock = require('../models/PageBlock');
const { validateLayout } = require('../models/sectionSchemas');

const MAX_SECTIONS = 12;
const MAX_LIMIT = 100;

function requestScope(req, scope) {
  if (scope === 'platform') return { scope: 'platform', vendor: null };
  const vendorId = req.vendor?._id || req.vendor?.id;
  if (!vendorId) {
    const error = new Error('Vendor context is required');
    error.statusCode = 403;
    throw error;
  }
  return { scope: 'vendor', vendor: vendorId };
}

function normalizeBlockInput(body = {}) {
  const title = String(body.title || '').trim();
  if (!title) {
    const error = new Error('title is required');
    error.statusCode = 400;
    throw error;
  }
  if (title.length > 120) {
    const error = new Error('title must be 120 characters or fewer');
    error.statusCode = 400;
    throw error;
  }
  const rawSections = Array.isArray(body.sections) ? body.sections : [];
  if (rawSections.length < 1 || rawSections.length > MAX_SECTIONS) {
    const error = new Error(`sections must contain between 1 and ${MAX_SECTIONS} items`);
    error.statusCode = 400;
    throw error;
  }

  let sections;
  try {
    sections = validateLayout({ sections: rawSections }).sections;
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }

  return {
    title,
    description: String(body.description || '').trim().slice(0, 500),
    sections,
    sectionCount: sections.length,
    sourcePageId: body.sourcePageId || null,
  };
}

function listBlocks(scope) {
  return asyncHandler(async (req, res) => {
    const { search = '', limit = 100 } = req.query;
    const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 50));
    const filter = { ...requestScope(req, scope), archivedAt: null };
    if (String(search).trim()) filter.title = { $regex: String(search).trim().slice(0, 80), $options: 'i' };
    const items = await PageBlock.find(filter)
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .lean();
    res.json({ success: true, items });
  });
}

function createBlock(scope) {
  return asyncHandler(async (req, res) => {
    const payload = normalizeBlockInput(req.body);
    const owner = requestScope(req, scope);
    const block = await PageBlock.create({
      ...payload,
      ...owner,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    res.status(201).json({ success: true, block: block.toObject() });
  });
}

function archiveBlock(scope) {
  return asyncHandler(async (req, res) => {
    const filter = { _id: req.params.id, ...requestScope(req, scope), archivedAt: null };
    const block = await PageBlock.findOneAndUpdate(
      filter,
      { $set: { archivedAt: new Date(), updatedBy: req.user?._id || null } },
      { new: true },
    ).lean();
    if (!block) { res.status(404); throw new Error('Reusable block not found'); }
    res.json({ success: true, block });
  });
}

module.exports = {
  listPageBlocks: listBlocks('platform'),
  createPageBlock: createBlock('platform'),
  archivePageBlock: archiveBlock('platform'),
  listVendorPageBlocks: listBlocks('vendor'),
  createVendorPageBlock: createBlock('vendor'),
  archiveVendorPageBlock: archiveBlock('vendor'),
};
