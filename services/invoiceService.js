const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const InvoiceCounter = require('../models/InvoiceCounter');
const Order = require('../models/Order');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { calculateTax, normalizeTaxProfile, resolveTaxProfile, roundMoney } = require('./taxService');

const tenantIdOf = tenant => tenant?._id || tenant || null;

const fiscalYearFor = dateValue => {
  const date = new Date(dateValue || Date.now());
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
};

const safePrefix = value => String(value || 'INV')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9_-]/g, '')
  .slice(0, 20) || 'INV';

const compactAddress = (address = {}) => ({
  fullName: String(address.fullName || '').trim(),
  phone: String(address.phone || '').trim(),
  street: String(address.street || address.line1 || '').trim(),
  line1: String(address.line1 || address.street || '').trim(),
  line2: String(address.line2 || '').trim(),
  city: String(address.city || '').trim(),
  state: String(address.state || '').trim(),
  pincode: String(address.pincode || '').trim(),
  country: String(address.country || 'India').trim(),
});

const nextInvoiceNumber = async ({ tenant, profile, dateValue, session, prefixOverride, scopeSuffix } = {}) => {
  const tenantId = tenantIdOf(tenant);
  const fiscalYear = fiscalYearFor(dateValue);
  const baseScope = `${tenantId ? tenantId.toString() : 'global'}:${fiscalYear}`;
  const scope = scopeSuffix ? `${baseScope}:${String(scopeSuffix).replace(/[^a-z0-9_-]/gi, '').slice(0, 30)}` : baseScope;
  // `sequence` is initialized by the schema default and incremented by the
  // same atomic update. Including it in `$setOnInsert` would conflict with
  // `$inc` on MongoDB upserts.
  const insert = { scope, fiscalYear };
  if (tenantId) insert.tenant = tenantId;
  const query = InvoiceCounter.findOneAndUpdate(
    { scope },
    { $inc: { sequence: 1 }, $setOnInsert: insert },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (session) query.session(session);
  const counter = await query;
  return `${safePrefix(prefixOverride || profile?.invoicePrefix)}/${fiscalYear}/${String(counter.sequence).padStart(6, '0')}`;
};

const loadUserSnapshot = async (order, session) => {
  if (order.user && typeof order.user === 'object' && (order.user.email || order.user.name || order.user.phone)) {
    return order.user;
  }
  if (!order.user) return {};
  const query = User.findById(order.user).select('name email phone gstin').lean();
  if (session) query.session(session);
  return (await query) || {};
};

const buildInvoiceLines = order => {
  const items = Array.isArray(order.items) ? order.items : [];
  const taxLines = Array.isArray(order.taxBreakdown) ? order.taxBreakdown : [];
  if (!taxLines.length) {
    return items.map((item, itemIndex) => ({
      lineType: 'item', itemIndex, product: item.product, title: item.title || 'Product', sku: item.sku || '',
      hsnCode: item.hsnCode || '', quantity: item.quantity || 0, unitPrice: roundMoney(item.price), rate: roundMoney(item.taxRate),
      grossAmount: roundMoney(Number(item.price || 0) * Number(item.quantity || 0)), discountAmount: 0,
      taxableAmount: roundMoney(item.taxableAmount || Number(item.price || 0) * Number(item.quantity || 0)),
      cgst: roundMoney(item.taxAmount / 2), sgst: roundMoney(item.taxAmount - item.taxAmount / 2), igst: 0,
      otherTax: 0, tax: roundMoney(item.taxAmount), sellerGstin: '', sellerState: '', sellerBusinessName: '',
      sellerBusinessAddress: item.taxProfile?.businessAddress || {}, invoicePrefix: '',
    }));
  }
  return taxLines.map(line => {
    const item = line.itemIndex === null || line.itemIndex === undefined ? null : items[line.itemIndex];
    return {
      lineType: line.lineType === 'shipping' ? 'shipping' : 'item',
      itemIndex: line.itemIndex,
      product: item?.product,
      title: line.title || item?.title || 'Product',
      sku: item?.sku || '',
      hsnCode: line.hsnCode || item?.hsnCode || '',
      quantity: Number(line.quantity || item?.quantity || 0),
      unitPrice: roundMoney(item?.price || (line.grossAmount / Math.max(1, Number(line.quantity || 1)))),
      rate: roundMoney(line.rate),
      grossAmount: roundMoney(line.grossAmount),
      discountAmount: roundMoney(line.discountAmount),
      taxableAmount: roundMoney(line.taxableAmount),
      cgst: roundMoney(line.cgst),
      sgst: roundMoney(line.sgst),
      igst: roundMoney(line.igst),
      otherTax: roundMoney(line.otherTax),
      tax: roundMoney(line.tax),
      sellerGstin: line.sellerGstin || '',
      sellerState: line.sellerState || '',
      sellerBusinessName: line.businessName || '',
      sellerBusinessAddress: item?.taxProfile?.businessAddress || {},
      invoicePrefix: line.invoicePrefix || '',
      invoiceNote: line.invoiceNote || '',
    };
  });
};

const buildCommercialInvoice = async ({ order, subOrder, vendor, tenant, kind, source, session, profile }) => {
  const isCommission = kind === 'commission';
  const base = roundMoney(isCommission ? subOrder.commissionAmount : subOrder.shippingCost);
  if (base <= 0) return null;
  const documentType = isCommission ? 'commission_invoice' : 'courier_invoice';
  const title = isCommission ? 'Platform commission' : 'Courier charges';
  const rate = Number(profile.defaultRate || 0);
  const taxQuote = calculateCommercialTax(base, profile, vendor.address || {});
  const line = {
    lineType: isCommission ? 'commission' : 'courier',
    itemIndex: null,
    title,
    hsnCode: isCommission ? '998599' : '9968',
    quantity: 1,
    unitPrice: base,
    rate,
    grossAmount: base,
    discountAmount: 0,
    taxableAmount: taxQuote.taxableAmount,
    cgst: taxQuote.cgst,
    sgst: taxQuote.sgst,
    igst: taxQuote.igst,
    otherTax: taxQuote.otherTax,
    tax: taxQuote.tax,
    sellerGstin: profile.sellerGstin || '',
    sellerState: profile.originState || '',
    sellerBusinessName: profile.businessName || '',
    sellerBusinessAddress: profile.businessAddress || {},
    invoicePrefix: isCommission ? 'COMM' : 'COUR',
  };
  const existingQuery = Invoice.findOne({
    order: order._id,
    vendor: vendor._id,
    documentType,
    status: 'issued',
  }).sort({ revision: -1 }).lean();
  if (tenant) existingQuery.where({ tenant });
  if (session) existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) return existing;
  const latestQuery = Invoice.findOne({ order: order._id, vendor: vendor._id, documentType }).sort({ revision: -1 }).lean();
  if (tenant) latestQuery.where({ tenant });
  if (session) latestQuery.session(session);
  const latest = await latestQuery;
  const buyerAddress = compactAddress(vendor.address || {});
  const invoice = {
    tenant: tenant || undefined,
    order: order._id,
    vendor: vendor._id,
    orderNumber: order.orderNumber || String(order._id),
    invoiceNumber: await nextInvoiceNumber({ tenant, profile, dateValue: order.createdAt, session, prefixOverride: isCommission ? 'COMM' : 'COUR', scopeSuffix: isCommission ? 'commission' : 'courier' }),
    revision: Math.max(1, Number(latest?.revision || 0) + 1),
    supersedes: latest?._id,
    documentType,
    invoiceKind: isCommission ? 'commission' : 'courier',
    status: 'issued',
    source,
    issueDate: new Date(),
    seller: {
      businessName: profile.businessName || 'Tatoz',
      gstin: profile.sellerGstin || '',
      state: profile.originState || '',
      address: profile.businessAddress || {},
    },
    buyer: {
      name: vendor.businessDetails?.legalName || vendor.storeName || 'Seller',
      email: vendor.contactEmail || '',
      phone: vendor.contactPhone || '',
      gstin: vendor.taxProfile?.sellerGstin || vendor.businessDetails?.gstNumber || '',
      address: buyerAddress,
    },
    items: [line],
    subtotal: base,
    discount: 0,
    shippingCost: 0,
    taxableAmount: taxQuote.taxableAmount,
    cgst: taxQuote.cgst,
    sgst: taxQuote.sgst,
    igst: taxQuote.igst,
    otherTax: taxQuote.otherTax,
    tax: taxQuote.tax,
    total: roundMoney(base + taxQuote.tax),
    currency: order.paymentCurrency || 'INR',
    paymentMethod: 'account_settlement',
    paymentStatus: 'pending',
    taxMode: profile.pricingMode,
    taxRegistrationType: profile.registrationType,
    gstInvoiceOwner: 'admin',
    invoiceNote: isCommission ? 'Commission charged by Tatoz on seller sales.' : 'Courier charges allocated to this seller order.',
  };
  let created;
  try {
    [created] = await Invoice.create([invoice], session ? { session } : undefined);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const duplicateQuery = Invoice.findOne({ order: order._id, vendor: vendor._id, documentType, status: 'issued' }).sort({ revision: -1 }).lean();
    if (tenant) duplicateQuery.where({ tenant });
    if (session) duplicateQuery.session(session);
    return duplicateQuery;
  }
  if (latest?._id) {
    const supersedeQuery = Invoice.updateOne({ _id: latest._id, ...(tenant ? { tenant } : {}) }, { $set: { supersededBy: created._id } });
    if (session) supersedeQuery.session(session);
    await supersedeQuery;
  }
  return created.toObject();
};

const calculateCommercialTax = (base, profile, buyerAddress) => {
  const quote = calculateTax({
    items: [{ title: 'Service', price: base, quantity: 1, taxRate: profile.defaultRate }],
    shippingAddress: buyerAddress,
    profile: { ...profile, shippingTaxable: false },
  });
  return {
    taxableAmount: roundMoney(quote.taxableAmount),
    cgst: roundMoney(quote.cgst),
    sgst: roundMoney(quote.sgst),
    igst: roundMoney(quote.igst),
    otherTax: roundMoney(quote.otherTax),
    tax: roundMoney(quote.tax),
  };
};

const ensureCommercialInvoicesForOrder = async ({ order: inputOrder, tenant, source = 'automatic', session } = {}) => {
  if (!inputOrder?._id) throw new Error('Order is required to generate commercial invoices');
  const tenantId = tenantIdOf(tenant) || inputOrder.tenant || null;
  const profile = normalizeTaxProfile(await resolveTaxProfile({ tenant: tenantId, session }));
  const subOrders = Array.isArray(inputOrder.subOrders) ? inputOrder.subOrders : [];
  const vendorIds = subOrders.map(item => item.vendor).filter(Boolean);
  const vendorQuery = Vendor.find({ _id: { $in: vendorIds }, ...(tenantId ? { tenant: tenantId } : {}) }).lean();
  if (session) vendorQuery.session(session);
  const vendors = await vendorQuery;
  const byId = new Map(vendors.map(vendor => [String(vendor._id), vendor]));
  const invoices = [];
  for (const subOrder of subOrders) {
    const vendor = byId.get(String(subOrder.vendor));
    if (!vendor) continue;
    const commission = await buildCommercialInvoice({ order: inputOrder, subOrder, vendor, tenant: tenantId, kind: 'commission', source, session, profile });
    const courier = await buildCommercialInvoice({ order: inputOrder, subOrder, vendor, tenant: tenantId, kind: 'courier', source, session, profile });
    if (commission) invoices.push(commission);
    if (courier) invoices.push(courier);
  }
  return invoices;
};

const supersedeCommercialInvoicesForOrder = async ({ orderId, tenant, reason = 'Superseded by an order adjustment', session } = {}) => {
  if (!mongoose.isValidObjectId(orderId)) return;
  const query = Invoice.updateMany({ order: orderId, documentType: { $in: ['commission_invoice', 'courier_invoice'] }, status: 'issued', ...(tenant ? { tenant: tenantIdOf(tenant) } : {}) }, { $set: { status: 'void', voidedAt: new Date(), voidReason: String(reason).slice(0, 500) } });
  if (session) query.session(session);
  await query;
};

const ensureInvoiceForOrder = async ({ order: inputOrder, tenant, documentType = 'tax_invoice', source = 'automatic', session } = {}) => {
  if (!inputOrder?._id) throw new Error('Order is required to generate an invoice');
  const tenantId = tenantIdOf(tenant) || inputOrder.tenant || null;
  const existingQuery = Invoice.findOne({ order: inputOrder._id, documentType, status: 'issued' }).sort({ revision: -1 }).lean();
  if (tenantId) existingQuery.where({ tenant: tenantId });
  if (session) existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) return existing;

  const latestQuery = Invoice.findOne({ order: inputOrder._id, documentType }).sort({ revision: -1 }).lean();
  if (tenantId) latestQuery.where({ tenant: tenantId });
  if (session) latestQuery.session(session);
  const latest = await latestQuery;
  const revision = Math.max(1, Number(latest?.revision || 0) + 1);

  const profile = await resolveTaxProfile({ tenant: tenantId, session });
  const normalizedProfile = normalizeTaxProfile(profile);
  const user = await loadUserSnapshot(inputOrder, session);
  const lines = buildInvoiceLines(inputOrder);
  const gstInvoiceOwner = inputOrder.gstInvoiceOwner || normalizedProfile.gstInvoiceOwner;
  const itemSellerKeys = [...new Set(lines
    .filter(line => line.lineType === 'item')
    .map(line => [line.sellerGstin, line.sellerState, line.sellerBusinessName, line.invoicePrefix].join('|'))
    .filter(Boolean))];
  const sellerLine = gstInvoiceOwner === 'seller'
    ? lines.find(line => line.lineType === 'item' && (line.sellerGstin || line.sellerBusinessName || line.sellerState))
    : null;
  // A single-vendor order can use that seller's invoice identity and numbering
  // policy. Mixed-vendor orders retain the platform invoice header while every
  // line keeps its seller snapshot for downstream split/settlement documents.
  const sellerProfile = itemSellerKeys.length === 1 && sellerLine
    ? {
      ...normalizedProfile,
      sellerGstin: sellerLine.sellerGstin,
      originState: sellerLine.sellerState,
      businessName: sellerLine.sellerBusinessName,
      businessAddress: sellerLine.sellerBusinessAddress || {},
      invoicePrefix: sellerLine.invoicePrefix || normalizedProfile.invoicePrefix,
      invoiceNote: sellerLine.invoiceNote || normalizedProfile.invoiceNote,
    }
    : normalizedProfile;
  const platformIdentity = {
    businessName: inputOrder.taxBusinessName || normalizedProfile.businessName || '',
    gstin: inputOrder.sellerGstin || normalizedProfile.sellerGstin || '',
    state: inputOrder.sellerState || normalizedProfile.originState || '',
    address: inputOrder.taxBusinessAddress || normalizedProfile.businessAddress || {},
  };
  const sellerIdentityAvailable = gstInvoiceOwner === 'seller' && itemSellerKeys.length === 1 && Boolean(sellerLine);
  const invoiceSeller = sellerIdentityAvailable
    ? {
      businessName: sellerProfile.businessName || '',
      gstin: sellerProfile.sellerGstin || '',
      state: sellerProfile.originState || '',
      address: sellerProfile.businessAddress || {},
    }
    : platformIdentity;
  const shippingAddress = compactAddress(inputOrder.shippingAddress || {});
  const invoice = {
    tenant: tenantId || undefined,
    order: inputOrder._id,
    orderNumber: inputOrder.orderNumber || String(inputOrder._id),
    invoiceNumber: await nextInvoiceNumber({ tenant: tenantId, profile: sellerProfile, dateValue: inputOrder.createdAt, session }),
    revision,
    supersedes: latest?._id,
    documentType,
    status: 'issued',
    source,
    issueDate: new Date(),
    seller: invoiceSeller,
    buyer: {
      name: shippingAddress.fullName || user.name || 'Customer',
      email: user.email || '',
      phone: shippingAddress.phone || user.phone || '',
      gstin: user.gstin || '',
      address: shippingAddress,
    },
    items: lines,
    subtotal: roundMoney(inputOrder.subtotal),
    discount: roundMoney(inputOrder.discount),
    shippingCost: roundMoney(inputOrder.shippingCost),
    taxableAmount: roundMoney(inputOrder.taxableAmount),
    cgst: roundMoney(inputOrder.cgst),
    sgst: roundMoney(inputOrder.sgst),
    igst: roundMoney(inputOrder.igst),
    otherTax: roundMoney(inputOrder.otherTax),
    tax: roundMoney(inputOrder.tax),
    total: roundMoney(inputOrder.total),
    currency: inputOrder.paymentCurrency || 'INR',
    paymentMethod: inputOrder.paymentMethod || '',
    paymentStatus: inputOrder.paymentStatus || 'pending',
    taxMode: inputOrder.taxMode || normalizedProfile.pricingMode,
    taxRegistrationType: inputOrder.taxRegistrationType || normalizedProfile.registrationType,
    gstInvoiceOwner,
    invoiceNote: inputOrder.invoiceNote || sellerProfile.invoiceNote || '',
  };

  let created;
  try {
    [created] = await Invoice.create([invoice], session ? { session } : undefined);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const duplicateQuery = Invoice.findOne({ order: inputOrder._id, documentType, status: 'issued' }).sort({ revision: -1 }).lean();
    if (tenantId) duplicateQuery.where({ tenant: tenantId });
    if (session) duplicateQuery.session(session);
    return duplicateQuery;
  }

  if (latest?._id) {
    const supersedeQuery = Invoice.updateOne(
      { _id: latest._id, ...(tenantId ? { tenant: tenantId } : {}) },
      { $set: { supersededBy: created._id } },
    );
    if (session) supersedeQuery.session(session);
    await supersedeQuery;
  }

  const orderUpdate = { invoice: created._id, invoiceNumber: created.invoiceNumber, invoiceIssuedAt: created.issueDate };
  const updateQuery = Order.updateOne({ _id: inputOrder._id, ...(tenantId ? { tenant: tenantId } : {}) }, { $set: orderUpdate });
  if (session) updateQuery.session(session);
  await updateQuery;
  if (typeof inputOrder.set === 'function') inputOrder.set(orderUpdate);
  else Object.assign(inputOrder, orderUpdate);
  return created.toObject();
};

// Commercial edits must never overwrite an issued snapshot. Mark the current
// snapshot void inside the same transaction; the next ensureInvoiceForOrder
// call creates and links the next revision.
const supersedeInvoiceForOrder = async ({ orderId, tenant, reason = 'Superseded by an order adjustment', session } = {}) => {
  if (!mongoose.isValidObjectId(orderId)) return { invoice: null, idempotent: true };
  const tenantId = tenantIdOf(tenant);
  const query = Invoice.findOne({ order: orderId, documentType: 'tax_invoice', status: 'issued' }).sort({ revision: -1 });
  if (tenantId) query.where({ tenant: tenantId });
  if (session) query.session(session);
  const invoice = await query;
  if (!invoice) return { invoice: null, idempotent: true };
  invoice.status = 'void';
  invoice.voidedAt = new Date();
  invoice.voidReason = String(reason || 'Superseded by an order adjustment').trim().slice(0, 500);
  await invoice.save(session ? { session } : undefined);
  return { invoice, idempotent: false };
};

const getInvoiceForOrder = async ({ orderId, tenant, userId, isAdmin = false } = {}) => {
  if (!mongoose.isValidObjectId(orderId)) return null;
  const tenantId = tenantIdOf(tenant);
  const query = { _id: orderId };
  if (tenantId) query.tenant = tenantId;
  if (userId && !isAdmin) query.user = userId;
  const order = await Order.findOne(query).lean();
  if (!order) return null;
  const existingQuery = Invoice.findOne({ order: order._id, documentType: 'tax_invoice' }).sort({ revision: -1 }).lean();
  if (tenantId) existingQuery.where({ tenant: tenantId });
  const existing = await existingQuery;
  return existing || ensureInvoiceForOrder({ order, tenant: tenantId, source: isAdmin ? 'admin' : 'automatic' });
};

const listInvoices = async ({ tenant, page = 1, limit = 20, status, search, documentType, vendor } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const query = {};
  const tenantId = tenantIdOf(tenant);
  if (tenantId) query.tenant = tenantId;
  if (status && ['issued', 'void'].includes(status)) query.status = status;
  if (documentType && ['tax_invoice', 'commission_invoice', 'courier_invoice', 'proforma', 'credit_note', 'debit_note'].includes(documentType)) query.documentType = documentType;
  if (vendor && mongoose.isValidObjectId(vendor)) query.vendor = vendor;
  if (search) {
    const escaped = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ invoiceNumber: { $regex: escaped, $options: 'i' } }, { orderNumber: { $regex: escaped, $options: 'i' } }, { 'buyer.name': { $regex: escaped, $options: 'i' } }];
  }
  const [total, invoices] = await Promise.all([
    Invoice.countDocuments(query),
    Invoice.find(query).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
  ]);
  return { invoices, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

module.exports = {
  ensureInvoiceForOrder,
  ensureCommercialInvoicesForOrder,
  supersedeCommercialInvoicesForOrder,
  supersedeInvoiceForOrder,
  getInvoiceForOrder,
  listInvoices,
  fiscalYearFor,
  nextInvoiceNumber,
};
