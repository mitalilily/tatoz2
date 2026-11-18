const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const Payout = require('../models/Payout');
const SettlementRun = require('../models/SettlementRun');
const VendorAudit = require('../models/VendorAudit');

/**
 * Close a settlement period: one payout per active vendor holding unpaid
 * delivered earnings. Idempotent per (tenant, periodStart, periodEnd) —
 * reruns only top up vendors that still lack a period payout.
 *
 * Earnings source is the same `subOrders.vendorEarnings` the seller
 * dashboard aggregates, minus payouts already issued for the period.
 */
const runSettlement = async ({ tenantId, periodStart, periodEnd, actorId }) => {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (!(start < end)) {
    const error = new Error('periodStart must be before periodEnd');
    error.statusCode = 422;
    throw error;
  }

  let run = await SettlementRun.findOne({ tenant: tenantId, periodStart: start, periodEnd: end });
  if (!run) {
    run = await SettlementRun.create({
      tenant: tenantId, periodStart: start, periodEnd: end, lines: [], createdBy: actorId,
    });
  }
  const settledVendorIds = new Set(
    (run.lines || []).filter((l) => l.payout).map((l) => String(l.vendor)),
  );

  const vendors = await Vendor.find({ tenant: tenantId, status: 'active' }).select('_id storeName settings bankDetails');
  const totals = { vendorsSettled: 0, vendorsSkipped: 0, grossEarnings: 0, commission: 0, netAmount: 0 };

  // eslint-disable-next-line no-restricted-syntax
  for (const vendor of vendors) {
    if (settledVendorIds.has(String(vendor._id))) {
      const existing = run.lines.find((l) => String(l.vendor) === String(vendor._id));
      totals.vendorsSettled += 1;
      totals.grossEarnings += existing?.grossEarnings || 0;
      totals.commission += existing?.commission || 0;
      totals.netAmount += existing?.netAmount || 0;
      continue;
    }
    const earnings = await Order.aggregate([
      { $match: { 'subOrders.vendor': vendor._id } },
      { $unwind: '$subOrders' },
      {
        $match: {
          'subOrders.vendor': vendor._id,
          'subOrders.status': 'delivered',
          'subOrders.updatedAt': { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          gross: { $sum: '$subOrders.vendorEarnings' },
          commission: { $sum: '$subOrders.commissionAmount' },
        },
      },
    ]);
    const gross = earnings[0]?.gross || 0;
    const commission = earnings[0]?.commission || 0;
    const net = Math.max(0, gross - 0);
    const threshold = vendor.settings?.minPayoutThreshold ?? 1000;
    if (gross <= 0 || net < threshold) {
      run.lines.push({
        vendor: vendor._id, payout: null, grossEarnings: gross, commission, netAmount: net,
        skippedReason: gross <= 0 ? 'No delivered earnings in period' : `Below min payout threshold (₹${threshold})`,
      });
      totals.vendorsSkipped += 1;
      continue;
    }
    const vendorWithBank = await Vendor.findById(vendor._id)
      .select('+bankDetails.accountNumber +bankDetails.ifscCode +bankDetails.upiId');
    const payout = await Payout.create({
      tenant: tenantId,
      vendor: vendor._id,
      amount: net,
      commissionDeducted: 0,
      netAmount: net,
      status: 'pending',
      bankSnapshot: {
        accountHolderName: vendor.bankDetails?.accountHolderName || '',
        accountNumber: vendorWithBank?.bankDetails?.accountNumber || '',
        ifscCode: vendorWithBank?.bankDetails?.ifscCode || '',
        bankName: vendor.bankDetails?.bankName || '',
      },
      periodStart: start,
      periodEnd: end,
      notes: `Settlement ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
    });
    await Vendor.findByIdAndUpdate(vendor._id, { $inc: { pendingPayout: net } });
    run.lines.push({ vendor: vendor._id, payout: payout._id, grossEarnings: gross, commission, netAmount: net });
    totals.vendorsSettled += 1;
    totals.grossEarnings += gross;
    totals.commission += commission;
    totals.netAmount += net;
    try {
      await VendorAudit.create({
        tenant: tenantId, vendor: vendor._id, actor: actorId, action: 'settlement_run',
        note: `Settlement payout ${payout._id} for ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
        after: { payoutId: payout._id, netAmount: net },
      });
    } catch (error) {
      console.error('Settlement audit write failed:', error.message);
    }
  }

  run.totals = totals;
  await run.save();
  return run;
};

module.exports = { runSettlement };
