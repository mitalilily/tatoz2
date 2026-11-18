const asyncHandler = require('express-async-handler');
const SecurityEvent = require('../models/SecurityEvent');

const listSecurityEvents = asyncHandler(async (req, res) => {
  if (!req.tenant?._id) { res.status(400); throw new Error('Tenant context is required'); }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const filter = { tenant: req.tenant._id };
  if (req.query.eventType) filter.eventType = String(req.query.eventType).slice(0, 80);
  if (req.query.surface) filter.surface = String(req.query.surface).slice(0, 40);
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  const [events, total] = await Promise.all([
    SecurityEvent.find(filter).populate('actor', 'name email role').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
      .select('eventType surface outcome reason code method route requestId metadata actor createdAt').lean(),
    SecurityEvent.countDocuments(filter),
  ]);
  res.json({ success: true, events, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, tenantScoped: true, source: 'tenant_security_event_ledger' });
});

module.exports = { listSecurityEvents };
