const TaxProfile = require('../models/TaxProfile');
const Settings = require('../models/Settings');

const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const clampRate = value => Math.min(100, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0));
const stateKey = value => String(value || '').trim().toLowerCase().replace(/[.\s_-]+/g, '');

const fallbackProfile = taxRate => ({
  _id: null,
  enabled: true,
  registrationType: 'unregistered',
  pricingMode: 'exclusive',
  defaultRate: clampRate(taxRate),
  originState: '',
  sellerGstin: '',
  gstInvoiceOwner: 'seller',
  businessName: '',
  businessAddress: {},
  invoicePrefix: 'INV',
  shippingTaxable: false,
  invoiceNote: '',
  gstComponents: { cgst: true, sgst: true, igst: true, utgst: true, cess: false },
  source: 'legacy_settings',
});

const resolveTaxProfile = async ({ tenant, session } = {}) => {
  const tenantId = tenant?._id || tenant;
  if (tenantId) {
    const query = TaxProfile.findOne({ tenant: tenantId }).lean();
    if (session) query.session(session);
    const profile = await query;
    if (profile) return { ...profile, source: 'tenant_profile' };
  }
  const taxRate = await Settings.get('tax_rate', 18, { session });
  return fallbackProfile(taxRate);
};

const normalizeTaxProfile = profile => ({
  enabled: profile?.enabled !== false,
  registrationType: profile?.registrationType === 'gstin' ? 'gstin' : 'unregistered',
  pricingMode: profile?.pricingMode === 'inclusive' ? 'inclusive' : 'exclusive',
  defaultRate: clampRate(profile?.defaultRate),
  originState: String(profile?.originState || '').trim(),
  sellerGstin: String(profile?.sellerGstin || '').trim().toUpperCase(),
  gstInvoiceOwner: profile?.gstInvoiceOwner === 'admin' ? 'admin' : 'seller',
  businessName: String(profile?.businessName || '').trim(),
  businessAddress: profile?.businessAddress && typeof profile.businessAddress === 'object' ? profile.businessAddress : {},
  invoicePrefix: String(profile?.invoicePrefix || 'INV').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20) || 'INV',
  shippingTaxable: profile?.shippingTaxable === true,
  invoiceNote: String(profile?.invoiceNote || '').trim(),
  gstComponents: {
    cgst: profile?.gstComponents?.cgst !== false,
    sgst: profile?.gstComponents?.sgst !== false,
    igst: profile?.gstComponents?.igst !== false,
    utgst: profile?.gstComponents?.utgst !== false,
    cess: profile?.gstComponents?.cess === true,
  },
});

const itemRate = (item, profile) => {
  const raw = item?.taxRate;
  const explicit = Number(raw);
  return raw !== null && raw !== undefined && raw !== '' && Number.isFinite(explicit) && explicit >= 0
    ? clampRate(explicit)
    : clampRate(profile.defaultRate);
};

// A bundle is priced as one commercial line, but its tax identity belongs to
// each physical component. Expand the immutable checkout snapshot here so a
// mixed 5%/18% bundle keeps the correct tax rate and HSN per component while
// callers can still address the aggregate with the parent item index.
const expandBundleTaxItems = items => (items || []).flatMap((item, parentIndex) => {
  const components = item?.itemType === 'bundle'
    ? [...(item.bundleComponents || item.components || []), ...(item.bundleRewards || item.freeRewards || [])]
    : [];
  if (!components.length) return [{ ...item, parentIndex, componentIndex: null }];
  const bundleQuantity = Math.max(0, Number(item.quantity || 0));
  return components.map((component, componentIndex) => ({
    ...component,
    itemType: 'bundle_component',
    parentIndex,
    componentIndex,
    title: `${item.title || item.bundleName || 'Bundle'} · ${component.title || 'Component'}`,
    quantity: Math.max(0, Number(component.quantity || 0)) * bundleQuantity,
    price: Number(component.allocatedUnitPrice ?? component.unitPrice ?? 0),
    taxRate: component.taxRate,
    taxProfile: component.taxProfile || item.taxProfile,
  }));
});

const calculateTax = ({ items = [], discount = 0, shippingCost = 0, shippingAddress = {}, profile, profileForItem } = {}) => {
  const normalized = normalizeTaxProfile(profile || fallbackProfile(18));
  const lines = [];
  const itemLines = expandBundleTaxItems(items).map((item, index) => ({
    index: item.parentIndex ?? index,
    componentIndex: item.componentIndex ?? null,
    hsnCode: String(item?.hsnCode || '').trim(),
    title: String(item?.title || '').trim(),
    quantity: Math.max(0, Number(item?.quantity || 0)),
    gross: roundMoney(Math.max(0, Number(item?.price || 0) * Number(item?.quantity || 0))),
    // A caller-provided profileForItem is authoritative. This is used by
    // checkout when the tenant policy says the admin GST identity must win
    // over a seller's stored profile. Legacy callers without the callback
    // retain the historical item.taxProfile behaviour.
    profile: normalizeTaxProfile(typeof profileForItem === 'function' ? profileForItem(item, index) : (item?.taxProfile || normalized)),
    rate: itemRate(item, normalizeTaxProfile(typeof profileForItem === 'function' ? profileForItem(item, index) : (item?.taxProfile || normalized))),
  }));
  const grossSubtotal = roundMoney(itemLines.reduce((sum, item) => sum + item.gross, 0));
  const safeDiscount = roundMoney(Math.min(Math.max(0, Number(discount || 0)), grossSubtotal));
  let discountRemaining = safeDiscount;

  itemLines.forEach((item, index) => {
    const allocatedDiscount = index === itemLines.length - 1
      ? roundMoney(discountRemaining)
      : roundMoney(grossSubtotal > 0 ? safeDiscount * item.gross / grossSubtotal : 0);
    discountRemaining = roundMoney(discountRemaining - allocatedDiscount);
    const discountedGross = roundMoney(Math.max(0, item.gross - allocatedDiscount));
    const lineProfile = item.profile || normalized;
    const rate = lineProfile.enabled ? item.rate : 0;
    const taxIncluded = lineProfile.pricingMode === 'inclusive';
    const tax = taxIncluded
      ? roundMoney(discountedGross - (discountedGross / (1 + rate / 100)))
      : roundMoney(discountedGross * rate / 100);
    const taxableAmount = taxIncluded ? roundMoney(discountedGross - tax) : discountedGross;
    const sameState = stateKey(lineProfile.originState) && stateKey(shippingAddress.state)
      ? stateKey(lineProfile.originState) === stateKey(shippingAddress.state)
      : null;
    const intraStateGst = tax && sameState === true && lineProfile.registrationType === 'gstin';
    const cgst = intraStateGst && lineProfile.gstComponents.cgst ? roundMoney(tax / 2) : 0;
    const sgst = intraStateGst && lineProfile.gstComponents.sgst ? roundMoney(lineProfile.gstComponents.cgst ? tax - cgst : tax / 2) : 0;
    const igst = tax && (sameState !== true) && lineProfile.registrationType === 'gstin' && lineProfile.gstComponents.igst ? tax : 0;
    const otherTax = lineProfile.registrationType === 'gstin' ? roundMoney(tax - cgst - sgst - igst) : tax;
    const line = {
      lineType: 'item',
      itemIndex: item.index,
      ...(item.componentIndex === null ? {} : { componentIndex: item.componentIndex }),
      title: item.title,
      hsnCode: item.hsnCode,
      quantity: item.quantity,
      rate,
      grossAmount: item.gross,
      discountAmount: allocatedDiscount,
      taxableAmount,
      cgst,
      sgst,
      igst,
      otherTax,
      tax,
      sellerGstin: lineProfile.sellerGstin,
      sellerState: lineProfile.originState,
      businessName: lineProfile.businessName,
      invoicePrefix: lineProfile.invoicePrefix,
      invoiceNote: lineProfile.invoiceNote,
    };
    lines.push(line);
  });

  const safeShipping = roundMoney(Math.max(0, Number(shippingCost || 0)));
  if (normalized.enabled && normalized.shippingTaxable && safeShipping > 0) {
    const rate = clampRate(normalized.defaultRate);
    const tax = normalized.pricingMode === 'inclusive'
      ? roundMoney(safeShipping - safeShipping / (1 + rate / 100))
      : roundMoney(safeShipping * rate / 100);
    const sameState = stateKey(normalized.originState) && stateKey(shippingAddress.state)
      ? stateKey(normalized.originState) === stateKey(shippingAddress.state)
      : null;
    const intraStateGst = sameState === true && normalized.registrationType === 'gstin';
    const cgst = intraStateGst && normalized.gstComponents.cgst ? roundMoney(tax / 2) : 0;
    const sgst = intraStateGst && normalized.gstComponents.sgst ? roundMoney(normalized.gstComponents.cgst ? tax - cgst : tax / 2) : 0;
    const igst = sameState !== true && normalized.registrationType === 'gstin' && normalized.gstComponents.igst ? tax : 0;
    lines.push({
      lineType: 'shipping', itemIndex: null, title: 'Shipping', hsnCode: '9968', quantity: 1, rate,
      grossAmount: safeShipping, discountAmount: 0,
      taxableAmount: normalized.pricingMode === 'inclusive' ? roundMoney(safeShipping - tax) : safeShipping,
      cgst, sgst, igst, otherTax: normalized.registrationType === 'gstin' ? roundMoney(tax - cgst - sgst - igst) : tax, tax,
      sellerGstin: normalized.sellerGstin,
      sellerState: normalized.originState,
      businessName: normalized.businessName,
      invoicePrefix: normalized.invoicePrefix,
      invoiceNote: normalized.invoiceNote,
    });
  }

  const summary = lines.reduce((result, line) => {
    result.taxableAmount = roundMoney(result.taxableAmount + line.taxableAmount);
    result.cgst = roundMoney(result.cgst + line.cgst);
    result.sgst = roundMoney(result.sgst + line.sgst);
    result.igst = roundMoney(result.igst + line.igst);
    result.otherTax = roundMoney(result.otherTax + line.otherTax);
    result.tax = roundMoney(result.tax + line.tax);
    return result;
  }, { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, otherTax: 0, tax: 0 });

  return {
    ...summary,
    lines,
    taxIncluded: normalized.pricingMode === 'inclusive',
    pricingMode: normalized.pricingMode,
    registrationType: normalized.registrationType,
    defaultRate: normalized.defaultRate,
    sellerGstin: normalized.sellerGstin,
    gstInvoiceOwner: normalized.gstInvoiceOwner,
    originState: normalized.originState,
    businessName: normalized.businessName,
    businessAddress: normalized.businessAddress,
    invoicePrefix: normalized.invoicePrefix,
    invoiceNote: normalized.invoiceNote,
    gstComponents: normalized.gstComponents,
    profileId: profile?._id || null,
    profileSource: profile?.source || 'provided',
  };
};

const publicTaxProfile = profile => {
  const normalized = normalizeTaxProfile(profile || fallbackProfile(18));
  return {
    enabled: normalized.enabled,
    registrationType: normalized.registrationType,
    pricingMode: normalized.pricingMode,
    defaultRate: normalized.defaultRate,
    gstInvoiceOwner: normalized.gstInvoiceOwner,
    shippingTaxable: normalized.shippingTaxable,
    gstComponents: normalized.gstComponents,
    source: profile?.source || 'legacy_settings',
  };
};

module.exports = {
  calculateTax,
  normalizeTaxProfile,
  publicTaxProfile,
  resolveTaxProfile,
  roundMoney,
};
