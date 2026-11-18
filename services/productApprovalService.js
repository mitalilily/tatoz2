const APPROVAL_STATUSES = new Set(['pending', 'approved', 'rejected']);

// Products created before vendor approval was introduced do not have an
// approvalStatus field. They remain visible for backwards compatibility;
// every new vendor submission is explicitly marked pending by the vendor API.
const approvedProductFilter = () => ({
  $or: [
    { vendor: { $exists: false } },
    { vendor: null },
    { approvalStatus: 'approved' },
    { approvalStatus: { $exists: false } },
  ],
});

const addApprovedProductFilter = query => {
  const target = query || {};
  if (!Array.isArray(target.$and)) target.$and = [];
  target.$and.push(approvedProductFilter());
  return target;
};

const isProductApproved = product => Boolean(
  product && (!product.vendor || !product.approvalStatus || product.approvalStatus === 'approved'),
);

const pendingVendorProductFields = (submittedAt = new Date()) => ({
  approvalStatus: 'pending',
  approvalSubmittedAt: submittedAt,
  approvalReviewedAt: null,
  approvalReviewedBy: null,
  approvalNote: '',
  rejectionReason: '',
  lifecycleStatus: 'draft',
  isActive: false,
});

module.exports = {
  APPROVAL_STATUSES,
  approvedProductFilter,
  addApprovedProductFilter,
  isProductApproved,
  pendingVendorProductFields,
};
