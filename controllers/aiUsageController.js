const asyncHandler = require('express-async-handler');
const AIUsage = require('../models/AIUsage');
const Settings = require('../models/Settings');

const FEATURE_LABELS = {
  product_ai: 'Product AI',
  seo: 'SEO AI',
  blog: 'Blog AI',
  click_tracking: 'Click Tracking AI',
  chat: 'Customer Chat AI',
  page_builder: 'Page Builder AI',
  other: 'Other AI',
};

function buildRange(query) {
  const now = new Date();
  const end = query.endDate ? new Date(`${query.endDate}T23:59:59.999Z`) : now;
  const start = query.startDate
    ? new Date(`${query.startDate}T00:00:00.000Z`)
    : new Date(end.getTime() - ((Number(query.days) || 30) - 1) * 86400000);
  return { $gte: start, $lte: end };
}

function buildMatch(query) {
  const match = { createdAt: buildRange(query) };
  if (query.feature) match.feature = query.feature;
  if (query.status) match.status = query.status;
  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(safe, 'i');
    match.$or = [
      { feature: regex },
      { action: regex },
      { endpoint: regex },
      { 'userSnapshot.name': regex },
      { 'userSnapshot.email': regex },
      { error: regex },
    ];
  }
  return match;
}

function projectBreakdown(rows) {
  return rows.map((row) => ({
    ...row,
    label: FEATURE_LABELS[row._id] || row._id,
    requests: row.requests || 0,
    credits: row.credits || 0,
    netCredits: row.netCredits || 0,
    success: row.success || 0,
    failed: row.failed || 0,
    rejected: row.rejected || 0,
  }));
}

const getAIUsage = asyncHandler(async (req, res) => {
  const match = buildMatch(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const skip = (page - 1) * limit;

  const [summaryRows, dailyTrend, featureBreakdown, total, usages, currentCredits] = await Promise.all([
    AIUsage.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        requests: { $sum: 1 },
        credits: { $sum: '$credits' },
        creditsRefunded: { $sum: '$creditsRefunded' },
        netCredits: { $sum: '$netCredits' },
        duration: { $sum: '$durationMs' },
        success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
      } },
    ]),
    AIUsage.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, requests: { $sum: 1 }, credits: { $sum: '$netCredits' }, success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    AIUsage.aggregate([
      { $match: match },
      { $group: { _id: '$feature', requests: { $sum: 1 }, credits: { $sum: '$credits' }, netCredits: { $sum: '$netCredits' }, success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }, rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } }, avgDuration: { $avg: '$durationMs' } } },
      { $sort: { requests: -1 } },
    ]),
    AIUsage.countDocuments(match),
    AIUsage.find(match).select('-model -tokenUsage').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Settings.get('ai_credits', 0),
  ]);

  const summary = summaryRows[0] || { requests: 0, credits: 0, creditsRefunded: 0, netCredits: 0, duration: 0, success: 0, failed: 0, rejected: 0 };
  res.json({
    success: true,
    summary: {
      ...summary,
      currentCredits: Number(currentCredits || 0),
      avgDurationMs: summary.requests ? Math.round(summary.duration / summary.requests) : 0,
      successRate: summary.requests ? Number(((summary.success / summary.requests) * 100).toFixed(1)) : 0,
    },
    dailyTrend,
    featureBreakdown: projectBreakdown(featureBreakdown),
    usages,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    filters: { startDate: match.createdAt.$gte, endDate: match.createdAt.$lte, feature: req.query.feature || '', status: req.query.status || '' },
  });
});

const exportAIUsage = asyncHandler(async (req, res) => {
  const rows = await AIUsage.find(buildMatch(req.query)).sort({ createdAt: -1 }).limit(10000).lean();
  const headers = ['Date', 'Feature', 'Action', 'Status', 'Credits', 'Refunded', 'Net credits', 'Duration ms', 'User', 'Email', 'Endpoint', 'Error'];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  rows.forEach((row) => lines.push([
    row.createdAt?.toISOString(), row.feature, row.action, row.status, row.credits, row.creditsRefunded, row.netCredits,
    row.durationMs, row.userSnapshot?.name, row.userSnapshot?.email, row.endpoint, row.error,
  ].map(escape).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ai-usage-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = { getAIUsage, exportAIUsage };
