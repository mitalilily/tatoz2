const PHONE_RE = /^[6-9]\d{9}$/;
const GSTIN_RE = /^[0-9A-Z]{15}$/;
const PIN_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const cleanPhone = value => {
  const compact = String(value || '').trim().replace(/[ -]/g, '');
  return /^\+91\d{10}$/.test(compact) || /^91\d{10}$/.test(compact) && compact.length === 12
    ? compact.slice(-10)
    : compact;
};

export const validateVendorRegistration = form => {
  const errors = {};
  if (String(form.storeName || '').trim().length < 2) errors.storeName = 'Store name must contain at least 2 characters';
  if (String(form.contactEmail || '').trim() && !EMAIL_RE.test(String(form.contactEmail).trim())) errors.contactEmail = 'Enter a valid contact email';
  if (!PHONE_RE.test(cleanPhone(form.contactPhone))) errors.contactPhone = 'Enter a valid 10-digit Indian mobile number';
  const address = form.address || {};
  if (String(address.fullName || '').trim().length < 2) errors['address.fullName'] = 'Full name is required';
  if (!PHONE_RE.test(cleanPhone(address.phone))) errors['address.phone'] = 'Enter a valid address phone number';
  if (String(address.street || '').trim().length < 5) errors['address.street'] = 'Complete street address is required';
  if (String(address.city || '').trim().length < 2) errors['address.city'] = 'City is required';
  if (String(address.state || '').trim().length < 2) errors['address.state'] = 'State is required';
  if (!PIN_RE.test(String(address.pincode || '').trim())) errors['address.pincode'] = 'Enter a valid 6-digit pincode';
  const business = form.businessDetails || {};
  if (String(business.legalName || '').trim().length < 2) errors['businessDetails.legalName'] = 'Legal business name is required';
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(business.panNumber || '').trim().toUpperCase())) errors['businessDetails.panNumber'] = 'Enter a valid PAN number';
  if (business.gstRegistrationType === 'gstin' && !GSTIN_RE.test(String(business.gstNumber || '').trim().toUpperCase())) errors['businessDetails.gstNumber'] = 'Enter a valid 15-character GSTIN';
  if (!/^[0-9]{9,18}$/.test(String(form.bankDetails?.accountNumber || '').trim())) errors['bankDetails.accountNumber'] = 'Account number must contain 9 to 18 digits';
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(form.bankDetails?.ifscCode || '').trim().toUpperCase())) errors['bankDetails.ifscCode'] = 'Enter a valid IFSC code';
  if (String(form.bankDetails?.accountHolderName || '').trim().length < 2) errors['bankDetails.accountHolderName'] = 'Account holder name is required';
  if (String(form.bankDetails?.bankName || '').trim().length < 2) errors['bankDetails.bankName'] = 'Bank name is required';
  return errors;
};

export const validateVendorStore = form => {
  const errors = {};
  if (!EMAIL_RE.test(String(form.contactEmail || '').trim())) errors.contactEmail = 'Enter a valid contact email';
  if (!PHONE_RE.test(cleanPhone(form.contactPhone))) errors.contactPhone = 'Enter a valid 10-digit Indian mobile number';
  const address = form.address || {};
  if (address.street && String(address.street).trim().length < 5) errors['address.street'] = 'Street address is too short';
  if (address.pincode && !PIN_RE.test(String(address.pincode).trim())) errors['address.pincode'] = 'Pincode must contain 6 digits';
  if (form.taxProfile?.registrationType === 'gstin' && !GSTIN_RE.test(String(form.taxProfile.sellerGstin || '').trim().toUpperCase())) errors.sellerGstin = 'Enter a valid 15-character GSTIN';
  return errors;
};
