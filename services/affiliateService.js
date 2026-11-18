const mongoose = require('mongoose');
const AffiliateProgram = require('../models/AffiliateProgram');
const AffiliateProfile = require('../models/AffiliateProfile');
const AffiliateLedger = require('../models/AffiliateLedger');
const AffiliatePayout = require('../models/AffiliatePayout');
const AffiliateCode = require('../models/ReferralCode');
const ReferralTracking = require('../models/ReferralTracking');
const User = require('../models/User');

const asId = value => value?._id || value;
const scopeFilter = tenant => (tenant ? { tenant: asId(tenant) } : { tenant: { $exists: false } });
const withSession = (query, session) => session ? query.session(session) : query;
const fail = (message, statusCode = 400, publicCode = 'AFFILIATE_WORKFLOW_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const getProgram = async (tenant, { session } = {}) => {
  const filter = scopeFilter(tenant);
  let program = await withSession(AffiliateProgram.findOne(filter), session);
  if (!program) {
    const created = await AffiliateProgram.create([{ tenant: asId(tenant) }], session ? { session } : undefined);
    program = created[0];
  }
  return program;
};

const getWalletSummary = async ({ tenant, affiliate, session } = {}) => {
  if (!mongoose.isValidObjectId(affiliate)) return { balance: 0, credits: 0, debits: 0 };
  const aggregate = AffiliateLedger.aggregate([
    { $match: { ...scopeFilter(tenant), affiliate: new mongoose.Types.ObjectId(affiliate) } },
    { $group: {
      _id: '$direction',
      total: { $sum: '$amount' },
    } },
  ]);
  if (session) aggregate.session(session);
  const rows = await aggregate;
  const credits = Number(rows.find(row => row._id === 'credit')?.total || 0);
  const debits = Number(rows.find(row => row._id === 'debit')?.total || 0);
  return { balance: Math.round((credits - debits) * 100) / 100, credits, debits };
};

const recordLedgerEntry = async ({ tenant, affiliate, type, direction, amount, reference = {}, idempotencyKey, note = '', createdBy, session } = {}) => {
  const value = Number(amount);
  if (!mongoose.isValidObjectId(affiliate)) throw fail('Affiliate account is invalid', 400, 'AFFILIATE_INVALID');
  if (!['credit', 'debit'].includes(direction) || !Number.isFinite(value) || value <= 0) {
    throw fail('Affiliate ledger entry is invalid', 400, 'AFFILIATE_LEDGER_INVALID');
  }
  if (!idempotencyKey) throw fail('Affiliate ledger idempotency key is required', 400, 'AFFILIATE_IDEMPOTENCY_REQUIRED');

  const filter = { ...scopeFilter(tenant), idempotencyKey };
  const existing = await withSession(AffiliateLedger.findOne(filter), session);
  if (existing) return { entry: existing, idempotent: true };

  const summary = await getWalletSummary({ tenant, affiliate, session });
  const balanceAfter = Math.round((summary.balance + (direction === 'credit' ? value : -value)) * 100) / 100;
  if (balanceAfter < 0) throw fail('Affiliate wallet balance is insufficient', 409, 'AFFILIATE_BALANCE_INSUFFICIENT');

  try {
    const created = await AffiliateLedger.create([{
      tenant: asId(tenant), affiliate, type, direction, amount: value, balanceAfter,
      reference, idempotencyKey, note: String(note || '').trim(), createdBy,
    }], session ? { session } : undefined);
    return { entry: created[0], idempotent: false };
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await withSession(AffiliateLedger.findOne(filter), session);
      if (duplicate) return { entry: duplicate, idempotent: true };
    }
    throw error;
  }
};

const createCommissionLedger = async ({ referralCode, tracking, amount, tenant, session } = {}) => {
  if (!referralCode?.owner || referralCode.ownerType !== 'affiliate' || Number(amount) <= 0) return null;
  const profile = await withSession(AffiliateProfile.findOne({ ...scopeFilter(tenant), user: referralCode.owner }), session);
  if (profile && ['rejected', 'suspended'].includes(profile.status)) return null;
  const program = await getProgram(tenant, { session });
  if (!program.enabled || (program.requireApproval && profile && profile.status !== 'approved')) return null;
  const result = await recordLedgerEntry({
    tenant,
    affiliate: referralCode.owner,
    type: 'commission_earned',
    direction: 'credit',
    amount,
    reference: { tracking: tracking._id, order: tracking.order },
    idempotencyKey: `commission:${tracking._id}`,
    note: `Commission earned for referral conversion ${tracking.code}`,
    session,
  });
  return result.entry;
};

const requestPayoutInSession = async ({ tenant, affiliate, amount, payoutMethod, idempotencyKey, session } = {}) => {
  if (!mongoose.isValidObjectId(affiliate)) throw fail('Affiliate account is invalid', 400, 'AFFILIATE_INVALID');
  const program = await getProgram(tenant, { session });
  if (!program.enabled) throw fail('Affiliate program is currently disabled', 409, 'AFFILIATE_PROGRAM_DISABLED');
  const profile = await withSession(AffiliateProfile.findOne({ ...scopeFilter(tenant), user: affiliate }), session);
  if (!profile || profile.status !== 'approved') throw fail('Affiliate account approval is required before requesting payout', 403, 'AFFILIATE_APPROVAL_REQUIRED');

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw fail('Payout amount must be greater than zero', 400, 'AFFILIATE_PAYOUT_AMOUNT_INVALID');
  if (value < Number(program.minimumPayout || 0)) throw fail(`Minimum affiliate payout is ${program.payoutCurrency} ${program.minimumPayout}`, 400, 'AFFILIATE_MINIMUM_PAYOUT');

  const requestKey = String(idempotencyKey || '').trim() || `payout:${affiliate}:${Date.now()}`;
  const existing = await withSession(AffiliatePayout.findOne({ ...scopeFilter(tenant), idempotencyKey: requestKey }), session);
  if (existing) return { payout: existing, idempotent: true };

  const wallet = await getWalletSummary({ tenant, affiliate, session });
  if (value > wallet.balance) throw fail('Payout amount exceeds the available affiliate balance', 409, 'AFFILIATE_BALANCE_INSUFFICIENT');

  const payout = (await AffiliatePayout.create([{
    tenant: asId(tenant), affiliate, amount: value, payoutMethod: payoutMethod || profile.payoutDetails?.method || 'bank_transfer',
    payoutSnapshot: profile.payoutDetails || {}, idempotencyKey: requestKey,
  }], session ? { session } : undefined))[0];
  await recordLedgerEntry({
    tenant, affiliate, type: 'payout_hold', direction: 'debit', amount: value,
    reference: { payout: payout._id }, idempotencyKey: `payout-hold:${payout._id}`,
    note: `Balance held for affiliate payout ${payout._id}`,
    session,
  });
  return { payout, idempotent: false };
};

const requestPayout = async (args = {}) => {
  if (args.session) return requestPayoutInSession(args);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await requestPayoutInSession({ ...args, session });
    });
  } finally {
    await session.endSession();
  }
  return result;
};

const transitionPayout = async ({ tenant, payoutId, to, actorId, transactionRef, note } = {}) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const payout = await AffiliatePayout.findOne({ _id: payoutId, ...scopeFilter(tenant) }).session(session);
      if (!payout) throw fail('Affiliate payout not found', 404, 'AFFILIATE_PAYOUT_NOT_FOUND');
      const allowed = {
        pending: ['processing', 'rejected', 'cancelled'],
        processing: ['paid', 'rejected'],
        paid: [], rejected: [], cancelled: [],
      };
      if (payout.status === to) { result = { payout, idempotent: true }; return; }
      if (!(allowed[payout.status] || []).includes(to)) throw fail(`Affiliate payout cannot move from ${payout.status} to ${to}`, 409, 'AFFILIATE_PAYOUT_TRANSITION_INVALID');
      payout.status = to;
      payout.reviewedBy = actorId;
      payout.processedAt = ['paid', 'rejected', 'cancelled'].includes(to) ? new Date() : payout.processedAt;
      if (transactionRef !== undefined) payout.transactionRef = String(transactionRef || '').trim();
      if (note !== undefined) payout.note = String(note || '').trim();
      await payout.save({ session });
      if (['rejected', 'cancelled'].includes(to)) {
        await recordLedgerEntry({
          tenant, affiliate: payout.affiliate, type: 'payout_release', direction: 'credit', amount: payout.amount,
          reference: { payout: payout._id }, idempotencyKey: `payout-release:${payout._id}`,
          note: `Affiliate payout ${to}; held balance released`, createdBy: actorId, session,
        });
      }
      result = { payout, idempotent: false };
    });
  } finally {
    await session.endSession();
  }
  return result;
};

const getDashboard = async ({ tenant, affiliate } = {}) => {
  const [program, profile, wallet, codes, payouts, ledger] = await Promise.all([
    getProgram(tenant),
    AffiliateProfile.findOne({ ...scopeFilter(tenant), user: affiliate }).lean(),
    getWalletSummary({ tenant, affiliate }),
    AffiliateCode.find({ ...scopeFilter(tenant), owner: affiliate }).populate('product', 'title slug thumbnail').sort({ createdAt: -1 }).lean(),
    AffiliatePayout.find({ ...scopeFilter(tenant), affiliate }).sort({ createdAt: -1 }).limit(50).lean(),
    AffiliateLedger.find({ ...scopeFilter(tenant), affiliate }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  return { program, profile, wallet, codes, payouts, ledger };
};

const listAdminAffiliates = async ({ tenant, status } = {}) => {
  const filter = { ...scopeFilter(tenant) };
  if (status) filter.status = status;
  const profiles = await AffiliateProfile.find(filter).populate('user', 'name email phone role affiliateCode isActive').sort({ createdAt: -1 }).lean();
  return Promise.all(profiles.map(async profile => ({
    ...profile,
    codes: await AffiliateCode.find({ ...scopeFilter(tenant), owner: profile.user?._id }).select('code isActive stats commissionRate commissionType').lean(),
    wallet: await getWalletSummary({ tenant, affiliate: profile.user?._id }),
  })));
};

const updateProfileStatus = async ({ tenant, profileId, status, adminNote, actorId } = {}) => {
  if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) throw fail('Invalid affiliate status', 400, 'AFFILIATE_STATUS_INVALID');
  const profile = await AffiliateProfile.findOne({ _id: profileId, ...scopeFilter(tenant) });
  if (!profile) throw fail('Affiliate profile not found', 404, 'AFFILIATE_PROFILE_NOT_FOUND');
  profile.status = status;
  profile.adminNote = String(adminNote || '').trim();
  profile.reviewedBy = actorId;
  profile.reviewedAt = new Date();
  await profile.save();
  if (status === 'approved') {
    await User.findByIdAndUpdate(profile.user, { $set: { role: 'affiliate' } });
  }
  return profile;
};

module.exports = {
  getProgram,
  getWalletSummary,
  recordLedgerEntry,
  createCommissionLedger,
  requestPayout,
  transitionPayout,
  getDashboard,
  listAdminAffiliates,
  updateProfileStatus,
};
