/**
 * Shared multi-vendor lifecycle vocabulary.
 * Single source of truth for onboarding states, review reason codes,
 * risk tiers and the current seller-agreement template version so the
 * backend, admin UI and seller portal never drift apart.
 */
const ONBOARDING_STATES = ['draft', 'pending', 'changes_requested', 'approved', 'rejected', 'suspended'];

const RISK_TIERS = ['standard', 'fasttrack', 'edd'];

// Current seller agreement template. Bump when legal terms change;
// acceptance records store the version the seller actually signed.
const AGREEMENT_VERSION = 'v1.0';

const REASON_CODES = [
  { code: 'DOC_MISSING', label: 'Document missing', appliesTo: ['changes_requested', 'rejected', 'reverify'] },
  { code: 'DOC_UNREADABLE', label: 'Document unreadable or expired', appliesTo: ['changes_requested', 'rejected'] },
  { code: 'GST_MISMATCH', label: 'GST / PAN details do not match', appliesTo: ['changes_requested', 'rejected'] },
  { code: 'BANK_MISMATCH', label: 'Bank details could not be verified', appliesTo: ['changes_requested', 'rejected'] },
  { code: 'DUPLICATE_STORE', label: 'Duplicate store or business identity', appliesTo: ['rejected'] },
  { code: 'POLICY_VIOLATION', label: 'Prohibited goods or policy violation', appliesTo: ['rejected', 'suspended'] },
  { code: 'PERFORMANCE', label: 'Performance / SLA breach', appliesTo: ['suspended'] },
  { code: 'FRAUD_RISK', label: 'Fraud / compliance risk hold', appliesTo: ['suspended', 'reverify'] },
  { code: 'ANNUAL_RECHECK', label: 'Scheduled annual re-verification', appliesTo: ['reverify'] },
  { code: 'OTHER', label: 'Other (see note)', appliesTo: ['changes_requested', 'rejected', 'suspended', 'reverify'] },
];

const isReasonCode = (code, action) => REASON_CODES.some(
  (entry) => entry.code === code && (!action || entry.appliesTo.includes(action)),
);

module.exports = {
  ONBOARDING_STATES,
  RISK_TIERS,
  AGREEMENT_VERSION,
  REASON_CODES,
  isReasonCode,
};
