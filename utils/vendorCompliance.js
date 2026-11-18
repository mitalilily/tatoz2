const FSSAI_CATEGORY_RE = /food|fmcg|grocery|beverage|dairy|bakery|meat|restaurant|snack/i;

const categoryRequiresFssai = category => FSSAI_CATEGORY_RE.test(String(category?.name || category?.slug || category || ''));

const vendorRequiresFssai = vendor => Boolean(
  vendor?.businessDetails?.requiresFssai
  || (Array.isArray(vendor?.businessDetails?.categoryIds) && vendor.businessDetails.categoryIds.some(categoryRequiresFssai)),
);

const documentUrl = value => (typeof value === 'string' ? value : value?.url || '');

const requiredVendorDocumentSlots = vendor => {
  const slots = ['panCard', 'businessProof', 'bankProof'];
  if (vendor?.businessDetails?.gstRegistrationType === 'gstin' || vendor?.businessDetails?.gstNumber) slots.unshift('gstCertificate');
  if (vendorRequiresFssai(vendor)) slots.push('fssaiCertificate');
  return slots;
};

module.exports = { FSSAI_CATEGORY_RE, categoryRequiresFssai, vendorRequiresFssai, documentUrl, requiredVendorDocumentSlots };
