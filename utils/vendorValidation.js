const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GSTIN_RE = /^[0-9A-Z]{15}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[A-Z0-9._-]{2,100}@[A-Z0-9.-]{2,50}$/i;
const PHONE_RE = /^[6-9]\d{9}$/;
const PINCODE_RE = /^\d{6}$/;

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const normalizedPhone = value => {
  const compact = text(value, 30).replace(/[ -]/g, '');
  return /^\+91\d{10}$/.test(compact) || /^91\d{10}$/.test(compact) && compact.length === 12
    ? compact.slice(-10)
    : compact;
};

const fieldError = (field, message) => ({ field, message });

const validateAddress = (address = {}, { required = true } = {}) => {
  const value = {
    fullName: text(address.fullName, 120),
    phone: normalizedPhone(address.phone),
    street: text(address.street || address.line1, 200),
    city: text(address.city, 100),
    state: text(address.state, 100),
    pincode: text(address.pincode, 10),
    country: text(address.country || 'India', 80) || 'India',
  };
  const errors = [];
  if (required || value.fullName) {
    if (value.fullName.length < 2) errors.push(fieldError('address.fullName', 'Full name must contain at least 2 characters'));
  }
  if (required || value.phone) {
    if (!PHONE_RE.test(value.phone)) errors.push(fieldError('address.phone', 'Enter a valid 10-digit Indian mobile number'));
  }
  if (required || value.street) {
    if (value.street.length < 5) errors.push(fieldError('address.street', 'Address must contain at least 5 characters'));
  }
  for (const field of ['city', 'state']) {
    if ((required || value[field]) && value[field].length < 2) errors.push(fieldError(`address.${field}`, `${field[0].toUpperCase()}${field.slice(1)} is required`));
  }
  if (required || value.pincode) {
    if (!PINCODE_RE.test(value.pincode)) errors.push(fieldError('address.pincode', 'Pincode must be a valid 6-digit value'));
  }
  return { value, errors };
};

const normalizeTaxProfile = (profile = {}) => ({
  enabled: profile.enabled !== false,
  registrationType: profile.registrationType === 'gstin' ? 'gstin' : 'unregistered',
  pricingMode: profile.pricingMode === 'inclusive' ? 'inclusive' : 'exclusive',
  defaultRate: Number.isFinite(Number(profile.defaultRate)) ? Math.min(100, Math.max(0, Number(profile.defaultRate))) : 18,
  originState: text(profile.originState, 100),
  sellerGstin: text(profile.sellerGstin, 30).toUpperCase(),
  gstInvoiceOwner: profile.gstInvoiceOwner === 'admin' ? 'admin' : 'seller',
  businessName: text(profile.businessName, 200),
  businessAddress: profile.businessAddress && typeof profile.businessAddress === 'object' ? profile.businessAddress : {},
  invoicePrefix: text(profile.invoicePrefix || 'INV', 20).toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'INV',
  shippingTaxable: profile.shippingTaxable === true,
  invoiceNote: text(profile.invoiceNote, 500),
  gstComponents: {
    cgst: profile.gstComponents?.cgst !== false,
    sgst: profile.gstComponents?.sgst !== false,
    igst: profile.gstComponents?.igst !== false,
    utgst: profile.gstComponents?.utgst !== false,
    cess: profile.gstComponents?.cess === true,
  },
});

const validateTaxProfile = (profile = {}) => {
  const value = normalizeTaxProfile(profile);
  const errors = [];
  const rawRate = profile.defaultRate;
  if (rawRate !== undefined && rawRate !== null && rawRate !== '') {
    const numericRate = Number(rawRate);
    if (!Number.isFinite(numericRate) || numericRate < 0 || numericRate > 100) {
      errors.push(fieldError('defaultRate', 'Tax rate must be between 0 and 100'));
    }
  }
  if (value.registrationType === 'gstin' && !GSTIN_RE.test(value.sellerGstin)) {
    errors.push(fieldError('sellerGstin', 'GSTIN must contain exactly 15 uppercase letters and numbers'));
  }
  if (value.sellerGstin && !GSTIN_RE.test(value.sellerGstin)) {
    errors.push(fieldError('sellerGstin', 'GSTIN must contain exactly 15 uppercase letters and numbers'));
  }
  if (value.registrationType === 'gstin' && value.originState.length < 2) {
    errors.push(fieldError('originState', 'Seller state is required for GST registration'));
  }
  return { value, errors };
};

const validateVendorRegistration = body => {
  const errors = [];
  const value = {
    storeName: text(body.storeName, 120),
    contactEmail: text(body.contactEmail, 160).toLowerCase(),
    contactPhone: normalizedPhone(body.contactPhone),
    description: text(body.description, 2000),
    address: null,
    businessDetails: {
      legalName: text(body.businessDetails?.legalName || body.storeName, 200),
      gstNumber: text(body.businessDetails?.gstNumber, 30).toUpperCase(),
      panNumber: text(body.businessDetails?.panNumber, 20).toUpperCase(),
      registrationNumber: text(body.businessDetails?.registrationNumber, 80),
      businessType: text(body.businessDetails?.businessType || 'individual', 30),
      gstRegistrationType: body.businessDetails?.gstRegistrationType === 'gstin' ? 'gstin' : 'unregistered',
      categoryIds: Array.isArray(body.businessDetails?.categoryIds) ? body.businessDetails.categoryIds.map(value => text(value, 80)).filter(Boolean).slice(0, 20) : [],
      requiresFssai: body.businessDetails?.requiresFssai === true,
    },
    bankDetails: {
      accountHolderName: text(body.bankDetails?.accountHolderName, 120),
      accountNumber: text(body.bankDetails?.accountNumber, 30),
      ifscCode: text(body.bankDetails?.ifscCode, 20).toUpperCase(),
      bankName: text(body.bankDetails?.bankName, 120),
      upiId: text(body.bankDetails?.upiId, 120),
    },
    socialLinks: body.socialLinks && typeof body.socialLinks === 'object' ? body.socialLinks : {},
  };
  if (value.storeName.length < 2) errors.push(fieldError('storeName', 'Store name must contain at least 2 characters'));
  if (value.contactEmail && !EMAIL_RE.test(value.contactEmail)) errors.push(fieldError('contactEmail', 'Enter a valid contact email'));
  if (!PHONE_RE.test(value.contactPhone)) errors.push(fieldError('contactPhone', 'Enter a valid 10-digit Indian mobile number'));
  const address = validateAddress(body.address, { required: true });
  value.address = address.value;
  errors.push(...address.errors);
  if (value.businessDetails.legalName.length < 2) errors.push(fieldError('businessDetails.legalName', 'Legal business name is required'));
  if (!PAN_RE.test(value.businessDetails.panNumber)) errors.push(fieldError('businessDetails.panNumber', 'Enter a valid PAN number'));
  if (value.businessDetails.gstRegistrationType === 'gstin' && !GSTIN_RE.test(value.businessDetails.gstNumber)) errors.push(fieldError('businessDetails.gstNumber', 'Enter a valid 15-character GSTIN'));
  if (value.businessDetails.gstNumber && !GSTIN_RE.test(value.businessDetails.gstNumber)) errors.push(fieldError('businessDetails.gstNumber', 'GSTIN must contain exactly 15 uppercase letters and numbers'));
  if (value.bankDetails.accountHolderName.length < 2) errors.push(fieldError('bankDetails.accountHolderName', 'Account holder name is required'));
  if (!/^\d{9,18}$/.test(value.bankDetails.accountNumber)) errors.push(fieldError('bankDetails.accountNumber', 'Account number must contain 9 to 18 digits'));
  if (!IFSC_RE.test(value.bankDetails.ifscCode)) errors.push(fieldError('bankDetails.ifscCode', 'Enter a valid 11-character IFSC code'));
  if (value.bankDetails.bankName.length < 2) errors.push(fieldError('bankDetails.bankName', 'Bank name is required'));
  if (value.bankDetails.upiId && !UPI_RE.test(value.bankDetails.upiId)) errors.push(fieldError('bankDetails.upiId', 'Enter a valid UPI ID'));
  for (const [key, link] of Object.entries(value.socialLinks)) {
    if (link && !/^https?:\/\/[^\s]+$/i.test(String(link))) errors.push(fieldError(`socialLinks.${key}`, 'URL must start with http:// or https://'));
  }
  return { value, errors };
};

module.exports = {
  EMAIL_RE,
  GSTIN_RE,
  PAN_RE,
  IFSC_RE,
  PHONE_RE,
  PINCODE_RE,
  normalizedPhone,
  normalizeTaxProfile,
  validateAddress,
  validateTaxProfile,
  validateVendorRegistration,
};
