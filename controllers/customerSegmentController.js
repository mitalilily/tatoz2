const asyncHandler = require('express-async-handler');
const customerSegmentService = require('../services/customerSegmentService');

const tenantOf = req => req.tenant?._id;

// @desc    List tenant-scoped customer segments
// @route   GET /api/admin/customer-segments
const listSegments = asyncHandler(async (req, res) => {
  const segments = await customerSegmentService.listSegments({ tenant: tenantOf(req) });
  res.json({ success: true, segments, fields: customerSegmentService.FIELD_CATALOG });
});

// @desc    Create a tenant-scoped customer segment
// @route   POST /api/admin/customer-segments
const createSegment = asyncHandler(async (req, res) => {
  const segment = await customerSegmentService.createSegment({
    tenant: tenantOf(req),
    body: req.body,
    actorId: req.user?._id,
  });
  res.status(201).json({ success: true, segment });
});

// @desc    Preview a segment without changing memberships
// @route   POST /api/admin/customer-segments/preview
const previewSegment = asyncHandler(async (req, res) => {
  const preview = await customerSegmentService.previewSegment({ tenant: tenantOf(req), definition: req.body?.definition });
  res.json({ success: true, preview });
});

// @desc    Get a tenant-scoped customer segment
// @route   GET /api/admin/customer-segments/:id
const getSegment = asyncHandler(async (req, res) => {
  const segment = await customerSegmentService.getSegment({ tenant: tenantOf(req), segmentId: req.params.id });
  if (!segment) { res.status(404); throw new Error('Customer segment not found'); }
  res.json({ success: true, segment, fields: customerSegmentService.FIELD_CATALOG });
});

// @desc    Update a tenant-scoped customer segment
// @route   PUT /api/admin/customer-segments/:id
const updateSegment = asyncHandler(async (req, res) => {
  const segment = await customerSegmentService.updateSegment({
    tenant: tenantOf(req),
    segmentId: req.params.id,
    body: req.body,
    actorId: req.user?._id,
  });
  if (!segment) { res.status(404); throw new Error('Customer segment not found'); }
  res.json({ success: true, segment });
});

// @desc    Re-evaluate and materialize tenant segment memberships
// @route   POST /api/admin/customer-segments/:id/apply
const applySegment = asyncHandler(async (req, res) => {
  const result = await customerSegmentService.applySegment({ tenant: tenantOf(req), segmentId: req.params.id });
  if (!result) { res.status(404); throw new Error('Customer segment not found'); }
  res.json({ success: true, ...result });
});

// @desc    Delete a tenant-scoped customer segment and its memberships
// @route   DELETE /api/admin/customer-segments/:id
const deleteSegment = asyncHandler(async (req, res) => {
  const deleted = await customerSegmentService.deleteSegment({ tenant: tenantOf(req), segmentId: req.params.id });
  if (!deleted) { res.status(404); throw new Error('Customer segment not found'); }
  res.json({ success: true, message: 'Customer segment deleted' });
});

module.exports = { listSegments, createSegment, previewSegment, getSegment, updateSegment, applySegment, deleteSegment };
