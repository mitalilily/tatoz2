const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const slugify = require('slugify');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { sendEmail } = require('../services/emailService');
const { validateVendorRegistration } = require('../utils/vendorValidation');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const Notification = require('../models/Notification');
const Category = require('../models/Category');
const { categoryRequiresFssai } = require('../utils/vendorCompliance');

// @desc    Register as a new vendor
// @route   POST /api/vendors/register
const registerVendor = asyncHandler(async (req, res) => {
  const validation = validateVendorRegistration(req.body || {});
  if (validation.errors.length) {
    const error = new Error(validation.errors[0].message);
    error.statusCode = 422;
    error.publicCode = 'VENDOR_REGISTRATION_INVALID';
    error.details = validation.errors;
    throw error;
  }
  const { storeName, contactEmail, contactPhone, description, businessDetails, bankDetails, address, socialLinks } = validation.value;

  if (!req.tenant?._id) {
    const error = new Error('Tenant context is required to submit a seller application');
    error.statusCode = 400;
    error.publicCode = 'TENANT_REQUIRED';
    throw error;
  }

  const requestedCategoryIds = businessDetails.categoryIds || [];
  if (requestedCategoryIds.some(id => !mongoose.isValidObjectId(id))) {
    res.status(422);
    throw new Error('One or more selling categories are invalid');
  }
  const selectedCategories = requestedCategoryIds.length
    ? await Category.find({ tenant: req.tenant._id, _id: { $in: requestedCategoryIds }, isActive: true }).select('name slug').lean()
    : [];
  if (selectedCategories.length !== requestedCategoryIds.length) {
    res.status(422);
    throw new Error('Select valid selling categories');
  }
  businessDetails.requiresFssai = Boolean(
    businessDetails.requiresFssai || selectedCategories.some(categoryRequiresFssai),
  );

  if (req.user.vendor || await Vendor.exists({ owner: req.user._id })) {
    res.status(409);
    throw new Error('You already have a vendor application');
  }

  const existingStore = await Vendor.findOne({
    tenant: req.tenant._id,
    storeName: { $regex: new RegExp(`^${storeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });
  if (existingStore) {
    res.status(400);
    throw new Error('Store name already taken');
  }

  let baseSlug = slugify(storeName, { lower: true, strict: true });
  let slug = baseSlug;
  let counter = 1;
  while (await Vendor.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const vendor = await Vendor.create({
    owner: req.user._id,
    tenant: req.tenant._id,
    storeName,
    slug,
    contactEmail,
    contactPhone: contactPhone || '',
    description: description || '',
    address,
    socialLinks,
    businessDetails,
    bankDetails,
    taxProfile: {
      registrationType: businessDetails.gstRegistrationType,
      sellerGstin: businessDetails.gstNumber,
      businessName: businessDetails.legalName,
      originState: address.state,
      businessAddress: address,
      gstLockedAt: businessDetails.gstNumber ? new Date() : null,
    },
    status: 'pending',
    onboarding: {
      state: 'pending',
      slaDueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      riskTier: 'standard',
      checklist: {
        profile: true,
        bank: Boolean(bankDetails?.accountNumber && bankDetails?.ifscCode),
        tax: Boolean(businessDetails?.panNumber),
        docs: false,
        agreement: false,
      },
    },
  });

  // Link user to vendor
  req.user.vendor = vendor._id;
  await req.user.save();

  // Keep the application visible in the tenant admin notification centre as
  // well as the email channel. Email delivery can be unavailable; this
  // tenant-scoped record is the authoritative review queue signal.
  try {
    await Notification.create({
      tenant: req.tenant._id,
      title: 'New seller application',
      message: `${storeName} submitted a seller application for admin review.`,
      type: 'system',
      target: 'role',
      targetRole: 'admin',
      status: 'sent',
      sentAt: new Date(),
      data: { kind: 'vendor_registration', vendorId: vendor._id, ownerId: req.user._id, storeName },
    });
  } catch (error) {
    console.error('Seller application notification failed:', error.message);
  }

  // Notify admin via email
  if (contactEmail) try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `New vendor registration: ${storeName}`,
      html: `<p>A new vendor has registered: <strong>${storeName}</strong></p>
             <p>Email: ${contactEmail}</p>
             <p>Login to admin to approve or reject this application.</p>`,
    });
  } catch (e) {
    // Email failure is non-fatal
  }

  try {
    const VendorAudit = require('../models/VendorAudit');
    await VendorAudit.create({
      tenant: req.tenant._id, vendor: vendor._id, actor: req.user._id, action: 'registered',
    });
  } catch (error) {
    console.error('Vendor registration audit failed:', error.message);
  }

  res.status(201).json({ success: true, message: 'Registration submitted for review', data: { vendorId: vendor._id, slug, status: vendor.status, onboarding: vendor.onboarding } });
});

// @desc    Get public vendor storefront
// @route   GET /api/vendors/store/:slug
const getPublicStore = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ slug: req.params.slug, status: 'active' })
    .populate('owner', 'name avatar');

  if (!vendor) {
    res.status(404);
    throw new Error('Store not found');
  }

  res.json({
    success: true,
    data: {
      _id: vendor._id,
      storeName: vendor.storeName,
      slug: vendor.slug,
      logo: vendor.logo,
      banner: vendor.banner,
      description: vendor.description,
      socialLinks: vendor.socialLinks,
      storefront: vendor.storefront,
      features: vendor.features,
      storeUrl: `${(process.env.CLIENT_URL || '').replace(/\/$/, '')}/store/${vendor.slug}`,
      stats: vendor.stats,
      joinedAt: vendor.createdAt,
    },
  });
});

// @desc    List active vendors (public directory)
// @route   GET /api/vendors
const listVendors = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const query = { status: 'active' };

  if (search) {
    query.storeName = { $regex: search, $options: 'i' };
  }

  const [vendors, total] = await Promise.all([
    Vendor.find(query)
      .select('storeName slug logo description stats')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Vendor.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: vendors,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Get vendor products for public storefront
// @route   GET /api/vendors/store/:slug/products
const getPublicStoreProducts = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ slug: req.params.slug, status: 'active' });
  if (!vendor) {
    res.status(404);
    throw new Error('Store not found');
  }

  const Product = require('../models/Product');
  const { page = 1, limit = 20, category, sort } = req.query;
  const query = { vendor: vendor._id, isActive: true };
  addApprovedProductFilter(query);

  if (category) query.category = category;

  let sortOption = { createdAt: -1 };
  if (sort === 'price_asc') sortOption = { price: 1 };
  else if (sort === 'price_desc') sortOption = { price: -1 };
  else if (sort === 'newest') sortOption = { createdAt: -1 };
  else if (sort === 'bestselling') sortOption = { totalSales: -1 };

  const [products, total] = await Promise.all([
    Product.find(query)
      .select('title slug price comparePrice images thumbnail stock ratings')
      .sort(sortOption)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Product.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: products,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

module.exports = { registerVendor, getPublicStore, listVendors, getPublicStoreProducts };
