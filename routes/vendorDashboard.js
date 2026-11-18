const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/auth');
const vendorAuth = require('../middleware/vendorAuth');
const vendorFeature = require('../middleware/vendorFeature');
const { upload } = require('../middleware/upload');
const { convertToWebp } = require('../middleware/convertToWebp');
const {
  getDashboard, getProducts, getProduct, createProduct, updateProduct, deleteProduct, bulkCreateProducts,
  getOrders, getOrderDetail, updateOrderStatus,
  getPayouts, requestPayout, getWallet, getLedger,
  updateStore, getStore, getTaxProfile, updateTaxProfile, getAnalytics,
} = require('../controllers/vendorDashboardController');
const {
  listTeam, inviteMember, acceptInvite, updateMember, removeMember,
} = require('../controllers/vendorTeamController');
const {
  listVendorPages, listVendorTemplates, getVendorPage, createVendorPage, updateVendorPage,
  publishVendorPage, discardVendorDraft, duplicateVendorPage, archiveVendorPage, unarchiveVendorPage,
  scheduleVendorPage, listVendorVersions, getVendorVersion, rollbackVendorVersion, vendorPreviewToken,
} = require('../controllers/vendorPageController');
const { aiEditPage } = require('../controllers/pageBuilderAIController');
const { rollbackPageBuilderCheckpoint } = require('../controllers/pageBuilderCheckpointController');
const { listVendorPageBlocks, createVendorPageBlock, archiveVendorPageBlock } = require('../controllers/pageBlockController');
const vendorMarketplaceController = require('../controllers/vendorMarketplaceController');
const vendorCommerceController = require('../controllers/vendorCommerceController');
const { getVendorInvoices } = require('../controllers/invoiceController');

const {
  getInventory, getLowStockProducts, updateStock, bulkUpdateStock, getInventoryLogs,
} = require('../controllers/vendorInventoryController');

router.use(protect, vendorAuth);

router.get('/dashboard', getDashboard);
router.get('/products', vendorFeature('catalog'), getProducts);
router.post('/products', vendorFeature('catalog'), createProduct);
router.post('/products/bulk', vendorFeature('catalog'), bulkCreateProducts);
router.get('/products/:id', vendorFeature('catalog'), getProduct);
router.put('/products/:id', vendorFeature('catalog'), updateProduct);
router.delete('/products/:id', vendorFeature('catalog'), deleteProduct);

// Vendor-owned Amazon/Flipkart connections and sync jobs. The controller
// scopes every record to both the authenticated vendor and its tenant.
router.get('/marketplace/stats', vendorFeature('catalog'), vendorMarketplaceController.getStats);
router.get('/marketplace/products', vendorFeature('catalog'), vendorMarketplaceController.getProducts);
router.get('/marketplace/connections', vendorFeature('catalog'), vendorMarketplaceController.getConnections);
router.post('/marketplace/connections', vendorFeature('catalog'), vendorMarketplaceController.createConnection);
router.put('/marketplace/connections/:id', vendorFeature('catalog'), vendorMarketplaceController.updateConnection);
router.delete('/marketplace/connections/:id', vendorFeature('catalog'), vendorMarketplaceController.deleteConnection);
router.get('/marketplace/connections/:id/authorize', vendorFeature('catalog'), vendorMarketplaceController.authorizeConnection);
router.post('/marketplace/connections/:id/test', vendorFeature('catalog'), vendorMarketplaceController.testConnection);
router.get('/marketplace/connections/:id/amazon/product-types/:productType', vendorFeature('catalog'), vendorMarketplaceController.getProductTypeDefinition);
router.post('/marketplace/connections/:id/sync', vendorFeature('catalog'), vendorMarketplaceController.startSync);
router.get('/marketplace/jobs', vendorFeature('catalog'), vendorMarketplaceController.getJobs);
router.get('/marketplace/listings', vendorFeature('catalog'), vendorMarketplaceController.getListings);
router.get('/marketplace/orders', vendorFeature('catalog'), vendorMarketplaceController.getOrders);
router.get('/orders', vendorFeature('orders'), getOrders);
router.get('/orders/:subOrderNumber', vendorFeature('orders'), getOrderDetail);
router.put('/orders/:subOrderNumber/status', vendorFeature('orders'), updateOrderStatus);
router.get('/payouts', vendorFeature('payouts'), getPayouts);
router.post('/payouts/request', vendorFeature('payouts'), requestPayout);
router.get('/wallet', getWallet);
router.get('/ledger', getLedger);

// Team: the store owner plus invited managers/staff. Auth resolves through
// vendorAuth (owner or active membership); manager-only writes are enforced
// inside the controller so reads stay available to every active member.
router.get('/team', listTeam);
router.post('/team/invite', inviteMember);
router.put('/team/:id', updateMember);
router.delete('/team/:id', removeMember);
router.get('/store', getStore);
router.put('/store', vendorFeature('customStorefront'), updateStore);
router.get('/tax-profile', getTaxProfile);
router.put('/tax-profile', updateTaxProfile);
router.get('/analytics', vendorFeature('analytics'), getAnalytics);
router.get('/commission', vendorFeature('commissions'), vendorCommerceController.getCommissionSummary);
router.get('/invoices', vendorFeature('commissions'), getVendorInvoices);
router.get('/reports', vendorFeature('reports'), vendorCommerceController.getVendorReports);
router.get('/reviews', vendorFeature('reviews'), vendorCommerceController.getVendorReviews);
router.put('/reviews/:id', vendorFeature('reviews'), vendorCommerceController.replyToVendorReview);
router.get('/subscription-plans', vendorFeature('subscriptions'), vendorCommerceController.getVendorSubscriptionPlans);
router.post('/subscription-plans', vendorFeature('subscriptions'), vendorCommerceController.createVendorSubscriptionPlan);
router.put('/subscription-plans/:id', vendorFeature('subscriptions'), vendorCommerceController.updateVendorSubscriptionPlan);
router.delete('/subscription-plans/:id', vendorFeature('subscriptions'), vendorCommerceController.deactivateVendorSubscriptionPlan);

// Vendor-owned Pages module. Every controller query is scoped to req.vendor.
router.get('/pages', vendorFeature('pageBuilder'), listVendorPages);
router.post('/pages', vendorFeature('pageBuilder'), createVendorPage);
router.get('/pages/templates', vendorFeature('pageBuilder'), listVendorTemplates);
router.get('/page-blocks', vendorFeature('pageBuilder'), listVendorPageBlocks);
router.post('/page-blocks', vendorFeature('pageBuilder'), createVendorPageBlock);
router.delete('/page-blocks/:id', vendorFeature('pageBuilder'), archiveVendorPageBlock);
router.get('/pages/preview-token/:id', vendorFeature('pageBuilder'), vendorPreviewToken);
router.get('/pages/:id', vendorFeature('pageBuilder'), getVendorPage);
router.put('/pages/:id', vendorFeature('pageBuilder'), updateVendorPage);
router.post('/pages/:id/ai-edit', vendorFeature('pageBuilder'), aiEditPage);
router.post('/pages/:id/ai-checkpoints/:checkpointId/rollback', vendorFeature('pageBuilder'), rollbackPageBuilderCheckpoint);
router.post('/pages/:id/publish', vendorFeature('pageBuilder'), publishVendorPage);
router.post('/pages/:id/discard-draft', vendorFeature('pageBuilder'), discardVendorDraft);
router.post('/pages/:id/schedule', vendorFeature('pageBuilder'), scheduleVendorPage);
router.get('/pages/:id/versions', vendorFeature('pageBuilder'), listVendorVersions);
router.get('/pages/:id/versions/:versionId', vendorFeature('pageBuilder'), getVendorVersion);
router.post('/pages/:id/rollback/:versionId', vendorFeature('pageBuilder'), rollbackVendorVersion);

// Image upload — accepts any field name so the same endpoint serves both flows:
//   - branding (VendorStoreSettingsPage): single file under 'image', returns { url }
//   - product (AddEditProductPage): multiple files under 'images', returns { images: [...] }
// The product shape mirrors /api/admin/upload for symmetry across admin and vendor.
router.post('/upload', upload.any(), convertToWebp(), (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ success: false, message: 'No image file provided' });
  }

  const toImage = (f) => ({
    url: `/uploads/${f.filename}`,
    publicId: f.filename,
    alt: f.originalname,
  });

  if (files[0].fieldname === 'image') {
    const image = toImage(files[0]);
    return res.json({ success: true, url: image.url, images: [image] });
  }

  // Page Builder sends a single `file` field. Returning both shapes keeps the
  // upload contract compatible with product galleries and the image picker.
  if (files.length === 1) {
    const image = toImage(files[0]);
    return res.json({ success: true, url: image.url, images: [image] });
  }

  res.json({ success: true, images: files.map(toImage) });
});

// Inventory endpoints
router.get('/inventory', vendorFeature('inventory'), getInventory);
router.get('/inventory/low-stock', vendorFeature('inventory'), getLowStockProducts);
router.patch('/inventory/:productId', vendorFeature('inventory'), updateStock);
router.post('/inventory/bulk', vendorFeature('inventory'), bulkUpdateStock);
router.get('/inventory/logs', vendorFeature('inventory'), getInventoryLogs);

// Categories & Brands (read-only reference)
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const { CATEGORY_LEVELS, buildCategoryTree } = require('../services/categoryHierarchyService');

router.get('/categories', vendorFeature('catalog'), asyncHandler(async (req, res) => {
  const categories = await Category.find({ tenant: req.vendor.tenant, isActive: true }).sort({ depth: 1, order: 1, name: 1 }).lean();
  res.json({ success: true, hierarchy: CATEGORY_LEVELS, data: buildCategoryTree(categories), categories: buildCategoryTree(categories) });
}));

router.get('/brands', vendorFeature('catalog'), asyncHandler(async (req, res) => {
  const brands = await Brand.find({ tenant: req.vendor.tenant, isActive: true }).sort({ order: 1 });
  res.json({ success: true, data: brands });
}));

module.exports = router;
