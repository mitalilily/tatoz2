const VendorAudit = require('../models/VendorAudit');

/**
 * Append one immutable audit row. Never throws: audit must not break the
 * business operation it records.
 */
const writeAudit = async ({ tenant, vendorId, actorId, action, reasonCode = '', note = '', before, after }) => {
  try {
    await VendorAudit.create({
      tenant: tenant || undefined,
      vendor: vendorId,
      actor: actorId || undefined,
      action,
      reasonCode: String(reasonCode || '').slice(0, 60),
      note: String(note || '').slice(0, 1000),
      before,
      after,
    });
  } catch (error) {
    console.error('Vendor audit write failed:', error.message);
  }
};

/**
 * Notify a single vendor owner inside the tenant notification centre.
 * Email failures stay non-fatal, mirroring the existing approve flow.
 */
const notifyVendorOwner = async (Notification, { tenantId, userId, title, message, kind, vendorId }) => {
  try {
    await Notification.create({
      tenant: tenantId,
      title,
      message,
      type: 'system',
      target: 'specific',
      targetUsers: [userId],
      status: 'sent',
      sentAt: new Date(),
      data: { kind, vendorId },
    });
  } catch (error) {
    console.error('Vendor owner notification failed:', error.message);
  }
};

module.exports = { writeAudit, notifyVendorOwner };
