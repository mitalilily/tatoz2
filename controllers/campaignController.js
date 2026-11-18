const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const campaignService = require('../services/campaignService');

const tenantOf = req => req.tenant?._id;

const list = asyncHandler(async (req, res) => {
  const result = await campaignService.list({ tenant: tenantOf(req), status: req.query.status, page: req.query.page, limit: req.query.limit });
  res.json({ success: true, ...result });
});

const get = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, tenant: tenantOf(req) }).lean();
  if (!campaign) { res.status(404); throw new Error('Campaign not found'); }
  const audience = await campaignService.resolveUsers(campaign);
  res.json({ success: true, campaign, audienceCount: audience.length });
});

const create = asyncHandler(async (req, res) => {
  const campaign = await campaignService.create({ tenant: tenantOf(req), body: req.body, actorId: req.user?._id });
  res.status(201).json({ success: true, campaign });
});

const update = asyncHandler(async (req, res) => {
  const campaign = await campaignService.update({ tenant: tenantOf(req), campaignId: req.params.id, body: req.body });
  if (!campaign) { res.status(404); throw new Error('Campaign not found'); }
  res.json({ success: true, campaign });
});

const execute = asyncHandler(async (req, res) => {
  const result = await campaignService.execute({ tenant: tenantOf(req), campaignId: req.params.id, force: req.body?.force === true });
  res.json({ success: true, ...result });
});

const remove = asyncHandler(async (req, res) => {
  const deleted = await Campaign.findOneAndDelete({ _id: req.params.id, tenant: tenantOf(req), status: { $in: ['draft', 'scheduled', 'failed'] } });
  if (!deleted) { res.status(404); throw new Error('Only draft, scheduled or failed campaigns can be deleted'); }
  res.json({ success: true });
});

module.exports = { list, get, create, update, execute, remove };
