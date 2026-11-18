const express = require('express');
const router = express.Router();
const { protect, admin, superAdmin } = require('../middleware/auth');
const { loadTenantOptional, requireTenantManager } = require('../services/tenantService');
const { enforceTenantPermission } = require('../services/tenantPermissionService');
const { loadAdminTenantScope } = require('../services/adminTenantScope');
const { upload, uploadMemory, uploadCSV, uploadMedia } = require('../middleware/upload');
const { convertToWebp } = require('../middleware/convertToWebp');
const adminVendorRoutes = require('./adminVendor');
const { requireActiveProvider, requireActiveProviderParam } = require('../middleware/activeProvider');
const adminStorageController = require('../controllers/adminStorageController');
const { strictLimiter } = require('../middleware/rateLimiter');

// Admin middleware applied to all routes
router.use(protect, loadTenantOptional, loadAdminTenantScope, admin, enforceTenantPermission);
// New operational control-plane writes/reads require membership in the
// resolved tenant. This prevents an admin token from switching tenants by
// changing only the Host header.
router.use(['/warehouses', '/warehouse-transfers', '/b2b', '/preorders', '/subscription-plans', '/security-events', '/support', '/recommendations', '/cod-policy', '/storefront-locale', '/affiliate', '/bundles', '/campaigns', '/api-keys'], requireTenantManager);

// Provider credentials are high-impact secrets. All admins can see masked
// status, but only a super admin can change, test, or remove them.
const integrations = require('../controllers/integrationController');
router.get('/integrations', integrations.getIntegrations);
router.put('/integrations/:provider', superAdmin, integrations.updateIntegration);
router.post('/integrations/:provider/test', superAdmin, integrations.testIntegration);
router.post('/integrations/smtp/test-email', superAdmin, strictLimiter, integrations.sendSmtpTestEmail);
router.delete('/integrations/:provider', superAdmin, integrations.clearIntegration);

// Feature/module switches are separate from encrypted provider credentials.
// Tenant managers use /api/tenant/modules; this platform route is the legacy
// super-admin fallback when no tenant context is available.
const modules = require('../controllers/moduleController');
const moduleControlPlane = require('../controllers/moduleControlPlaneController');
router.get('/modules/control-plane', moduleControlPlane.getControlPlane);
router.put('/modules/control-plane/authentication', superAdmin, moduleControlPlane.updateAuthentication);
router.put('/modules/control-plane/shipping', superAdmin, moduleControlPlane.updateShipping);
router.put('/modules/control-plane/payment', superAdmin, moduleControlPlane.updatePayment);
router.get('/modules', modules.getModules);
router.put('/modules/:module', superAdmin, modules.updateModule);

// Storefront authentication is a separate policy from provider credentials.
// Only super admins can change the active mode so a tenant cannot accidentally
// lock the platform control plane out of its own recovery path.
const authPolicy = require('../controllers/authPolicyController');
router.get('/auth-policy', authPolicy.getPlatformAuthPolicy);
router.put('/auth-policy', superAdmin, authPolicy.updatePlatformAuthPolicy);

// Provider-neutral partner dashboards. Razorpay and Shiprocket retain their
// legacy deep dashboards; these routes power individual pages for every
// selected/available payment and shipping partner.
const providerDashboard = require('../controllers/providerDashboardController');
const shipmentController = require('../controllers/shipmentController');
router.use('/payment-providers/:provider', requireActiveProviderParam('payment'));
router.use('/shipping-providers/:provider', requireActiveProviderParam('shipping'));
router.get('/payment-providers/:provider/summary', providerDashboard.paymentSummary);
router.get('/payment-providers/:provider/transactions', providerDashboard.paymentTransactions);
router.post('/payment-providers/:provider/refunds', superAdmin, providerDashboard.paymentRefund);
router.get('/shipping-providers/:provider/summary', providerDashboard.shippingSummary);
router.get('/shipping-providers/:provider/shipments', providerDashboard.shippingShipments);
router.post('/shipping-providers/:provider/rates', providerDashboard.shippingRates);
router.post('/shipping-providers/:provider/track', providerDashboard.shippingTrack);
router.post('/shipping-providers/:provider/shipments', (req, res, next) => {
  req.body = { ...(req.body || {}), provider: req.params.provider };
  return shipmentController.createShipment(req, res, next);
});
router.get('/shipments', shipmentController.listShipments);
router.get('/shipments/:id/events', shipmentController.getShipmentEvents);
router.put('/shipments/:id/status', shipmentController.updateShipmentStatus);
router.post('/shipments/:id/sync', shipmentController.syncShipment);
const { getQueueHealth } = require('../controllers/queueController');
router.get('/queues/health', getQueueHealth);
const securityEventController = require('../controllers/securityEventController');
router.get('/security-events', securityEventController.listSecurityEvents);
const adminTwoFactorController = require('../controllers/adminTwoFactorController');
router.get('/security/2fa', adminTwoFactorController.getStatus);
router.post('/security/2fa/setup', adminTwoFactorController.setup);
router.post('/security/2fa/enable', adminTwoFactorController.enable);
router.post('/security/2fa/disable', adminTwoFactorController.disable);

// Tenant staff is a membership-based control plane. Passwords are accepted
// only for account creation/reset and are never returned after hashing.
const tenantStaffController = require('../controllers/tenantStaffController');
router.get('/staff', tenantStaffController.listStaff);
router.post('/staff', tenantStaffController.createStaff);
router.put('/staff/:id', tenantStaffController.updateStaff);
router.post('/staff/:id/password', tenantStaffController.resetStaffPassword);
const apiKeyController = require('../controllers/apiKeyController');
router.get('/api-keys', apiKeyController.list);
router.post('/api-keys', apiKeyController.create);
router.delete('/api-keys/:id', apiKeyController.revoke);

const supportController = require('../controllers/supportController');
router.get('/support', supportController.listAdminTickets);
router.get('/support/:id', supportController.getAdminTicket);
router.put('/support/:id', supportController.updateAdminTicket);
router.post('/support/:id/replies', supportController.replyAdminTicket);

const recommendationController = require('../controllers/recommendationController');
router.get('/recommendations', recommendationController.adminList);
router.post('/recommendations', recommendationController.adminCreate);
router.put('/recommendations/:id', recommendationController.adminUpdate);
router.delete('/recommendations/:id', recommendationController.adminDelete);

const codPolicyController = require('../controllers/codPolicyController');
router.get('/cod-policy', codPolicyController.getPolicy);
router.put('/cod-policy', codPolicyController.updatePolicy);

const storefrontLocaleController = require('../controllers/storefrontLocaleController');
router.get('/storefront-locale', storefrontLocaleController.getConfig);
router.put('/storefront-locale', storefrontLocaleController.updateConfig);
router.post('/storefront-locale/refresh-rates', storefrontLocaleController.refreshRates);

// External marketplace integrations (Amazon SP-API + Flipkart Seller API)
const marketplaceController = require('../controllers/marketplaceController');
router.get('/marketplace/stats', marketplaceController.getStats);
router.get('/marketplace/connections', marketplaceController.getConnections);
router.post('/marketplace/connections', marketplaceController.createConnection);
router.put('/marketplace/connections/:id', marketplaceController.updateConnection);
router.delete('/marketplace/connections/:id', marketplaceController.deleteConnection);
router.get('/marketplace/connections/:id/authorize', marketplaceController.authorizeConnection);
router.post('/marketplace/connections/:id/test', marketplaceController.testConnection);
router.get('/marketplace/connections/:id/amazon/product-types/:productType', marketplaceController.getProductTypeDefinition);
router.post('/marketplace/connections/:id/sync', marketplaceController.startSync);
router.post('/marketplace/connections/:id/mappings', marketplaceController.upsertMapping);
router.post('/marketplace/connections/:id/shipment-action', marketplaceController.shipmentAction);
router.get('/marketplace/jobs', marketplaceController.getJobs);
router.get('/marketplace/jobs/:jobId', marketplaceController.getJob);
router.get('/marketplace/listings', marketplaceController.getListings);
router.get('/marketplace/orders', marketplaceController.getOrders);

// Dashboard
const { getDashboardStats, getUsers, updateUser, getSegmentCounts, getSettings, updateSettings, createNotification, previewNotificationAudience, getNotifications, getSalesAnalytics } = require('../controllers/adminController');
const taxController = require('../controllers/taxController');
const invoiceController = require('../controllers/invoiceController');
const invoiceNoteController = require('../controllers/invoiceNoteController');
const { getCustomer360 } = require('../controllers/customer360Controller');
const { getOperationAnalytics } = require('../controllers/adminAnalyticsController');
const customerSegmentController = require('../controllers/customerSegmentController');
const { getProductIntentAnalytics } = require('../controllers/productIntentController');
const walletController = require('../controllers/walletController');
const loyaltyController = require('../controllers/loyaltyController');
const giftCardController = require('../controllers/giftCardController');
const shippingRuleController = require('../controllers/shippingRuleController');
router.get('/dashboard', getDashboardStats);
router.get('/users', getUsers);
router.get('/users/segments', getSegmentCounts);
router.get('/users/:id/360', getCustomer360);
router.put('/users/:id', updateUser);
router.get('/customer-segments', customerSegmentController.listSegments);
router.post('/customer-segments/preview', customerSegmentController.previewSegment);
router.post('/customer-segments', customerSegmentController.createSegment);
router.get('/customer-segments/:id', customerSegmentController.getSegment);
router.put('/customer-segments/:id', customerSegmentController.updateSegment);
router.post('/customer-segments/:id/apply', customerSegmentController.applySegment);
router.delete('/customer-segments/:id', customerSegmentController.deleteSegment);
router.get('/product-intents', getProductIntentAnalytics);
router.get('/wallets', walletController.getWallets);
router.get('/wallets/:userId', walletController.getWalletForCustomer);
router.post('/wallets/:userId/adjust', walletController.adjustWallet);
router.post('/wallets/bulk-adjust', walletController.adjustWalletsBulk);
router.get('/loyalty', loyaltyController.getProgram);
router.put('/loyalty', superAdmin, loyaltyController.updateProgram);
router.get('/loyalty/accounts', loyaltyController.getAccounts);
router.post('/loyalty/accounts/:userId/adjust', loyaltyController.adjustAccount);
router.post('/loyalty/accounts/bulk-adjust', loyaltyController.adjustAccountsBulk);
router.get('/gift-cards', giftCardController.getGiftCards);
router.post('/gift-cards', giftCardController.createGiftCard);
router.post('/gift-cards/bulk', giftCardController.createGiftCardsBulk);
router.put('/gift-cards/:id/status', giftCardController.updateGiftCardStatus);
router.get('/gift-cards/:id/transactions', giftCardController.getGiftCardTransactions);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.get('/shipping-rules', shippingRuleController.getShippingRules);
router.post('/shipping-zones', shippingRuleController.createShippingZone);
router.put('/shipping-zones/:id', shippingRuleController.updateShippingZone);
router.delete('/shipping-zones/:id', shippingRuleController.deleteShippingZone);
router.post('/shipping-rates', shippingRuleController.createShippingRate);
router.put('/shipping-rates/:id', shippingRuleController.updateShippingRate);
router.delete('/shipping-rates/:id', shippingRuleController.deleteShippingRate);
const serviceablePincodeController = require('../controllers/serviceablePincodeController');
router.get('/serviceable-pincodes', serviceablePincodeController.list);
router.post('/serviceable-pincodes', serviceablePincodeController.create);
router.put('/serviceable-pincodes/:id', serviceablePincodeController.update);
router.delete('/serviceable-pincodes/:id', serviceablePincodeController.remove);
router.get('/tax/profile', taxController.getAdminTaxProfile);
router.put('/tax/profile', taxController.updateAdminTaxProfile);
router.get('/invoices', invoiceController.getAdminInvoices);
router.get('/invoices/:id', invoiceController.getAdminInvoice);
router.put('/invoices/:id/void', invoiceController.voidAdminInvoice);
router.get('/invoice-notes', invoiceNoteController.getAdminInvoiceNotes);
router.get('/invoice-notes/deliveries', invoiceNoteController.getAdminInvoiceDeliveries);
router.get('/invoice-notes/:id', invoiceNoteController.getAdminInvoiceNote);
router.post('/invoices/:invoiceId/notes', invoiceNoteController.createAdminInvoiceNote);
router.put('/invoice-notes/:id/void', invoiceNoteController.voidAdminInvoiceNote);
router.post('/invoice-notes/:noteId/deliver', invoiceNoteController.deliverAdminInvoiceDocument);
router.post('/invoices/:invoiceId/deliver', invoiceNoteController.deliverAdminInvoiceDocument);
router.post('/notifications', createNotification);
router.post('/notifications/preview', previewNotificationAudience);
router.get('/notifications', getNotifications);
router.get('/analytics/sales', getSalesAnalytics);
const campaignController = require('../controllers/campaignController');
router.get('/campaigns', campaignController.list);
router.post('/campaigns', campaignController.create);
router.get('/campaigns/:id', campaignController.get);
router.put('/campaigns/:id', campaignController.update);
router.post('/campaigns/:id/execute', campaignController.execute);
router.delete('/campaigns/:id', campaignController.remove);
// Detailed analytics are loaded only after an admin opens an operation panel.
router.get('/analytics/operations/:operation', getOperationAnalytics);

// Products
const { createProduct, updateProduct, deleteProduct, duplicateProduct, getAdminProducts, getAdminProductVendors, getAdminProduct, updateProductImages, reviewProduct } = require('../controllers/productController');
const productTaxController = require('../controllers/productTaxController');
const inventoryController = require('../controllers/inventoryController');
router.get('/inventory/overview', inventoryController.getInventoryOverview);
router.get('/inventory/reservations', inventoryController.getInventoryReservations);
router.get('/inventory/movements', inventoryController.getInventoryMovements);
router.get('/inventory/export', inventoryController.exportInventory);
router.get('/inventory/import-template', inventoryController.downloadInventoryTemplate);
router.post('/inventory/import', uploadCSV.single('file'), inventoryController.importInventory);
const warehouseController = require('../controllers/warehouseController');
router.get('/warehouses', warehouseController.listWarehouses);
router.post('/warehouses', warehouseController.createWarehouse);
router.put('/warehouses/:id', warehouseController.updateWarehouse);
router.get('/warehouses/:id/inventory', warehouseController.listInventory);
router.post('/warehouses/:id/inventory', warehouseController.setInventory);
router.get('/warehouse-transfers', warehouseController.listTransfers);
router.post('/warehouse-transfers', warehouseController.createTransfer);
router.post('/warehouse-transfers/:id/dispatch', warehouseController.dispatchTransfer);
router.post('/warehouse-transfers/:id/receive', warehouseController.receiveTransfer);
const b2bController = require('../controllers/b2bController');
router.get('/b2b/accounts', b2bController.listAccounts);
router.post('/b2b/accounts', b2bController.createAccount);
router.put('/b2b/accounts/:id', b2bController.updateAccount);
router.get('/b2b/price-rules', b2bController.listPriceRules);
router.post('/b2b/price-rules', b2bController.createPriceRule);
const preorderSubscriptionController = require('../controllers/preorderSubscriptionController');
router.get('/preorders', preorderSubscriptionController.listAdminPreorders);
router.put('/preorders/:id/status', preorderSubscriptionController.updatePreorderStatus);
router.get('/subscription-plans', preorderSubscriptionController.listPlans);
router.post('/subscription-plans', preorderSubscriptionController.createPlan);
const { exportProducts, downloadTemplate, importProducts } = require('../controllers/productImportController');
const { exportCustomers, downloadCustomerTemplate, importCustomers } = require('../controllers/customerImportController');
const { getAdminQuestions, updateQuestion, deleteQuestion } = require('../controllers/questionController');
router.get('/products/vendors', getAdminProductVendors);
router.get('/products', getAdminProducts);
router.get('/products/export', exportProducts);
router.get('/products/import-template', downloadTemplate);
router.post('/products/import', uploadCSV.single('file'), importProducts);
router.get('/products/tax', productTaxController.getProductTaxes);
router.patch('/products/tax', productTaxController.bulkUpdateProductTaxes);
router.patch('/products/:id/tax', productTaxController.updateProductTax);
router.get('/customers/export', exportCustomers);
router.get('/customers/import-template', downloadCustomerTemplate);
router.post('/customers/import', uploadCSV.single('file'), importCustomers);
router.post('/products', createProduct);
router.get('/products/:id', getAdminProduct);
router.post('/products/:id/duplicate', duplicateProduct);
router.put('/products/:id', updateProduct);
router.put('/products/:id/approval', reviewProduct);
router.delete('/products/:id', deleteProduct);
router.post('/products/:id/images', updateProductImages);

// First-class fixed/custom/mix-and-match bundles. Component stock is checked
// again at cart and checkout time; the browser never supplies bundle pricing.
const bundleController = require('../controllers/bundleController');
router.get('/bundles', bundleController.listAdminBundles);
router.post('/bundles', bundleController.createBundle);
router.get('/bundles/:id', bundleController.getAdminBundle);
router.post('/bundles/:id/quote', bundleController.quoteAdminBundle);
router.post('/bundles/:id/duplicate', bundleController.duplicateBundle);
router.post('/bundles/:id/publish', bundleController.publishBundle);
router.post('/bundles/:id/archive', bundleController.archiveBundle);
router.get('/bundles/:id/analytics', bundleController.getBundleAnalytics);
router.put('/bundles/:id', bundleController.updateBundle);
router.delete('/bundles/:id', bundleController.deleteBundle);

// Q&A (admin)
router.get('/questions', getAdminQuestions);
router.put('/questions/:id', updateQuestion);
router.delete('/questions/:id', deleteQuestion);

// Image upload
router.post('/upload', upload.array('images', 10), convertToWebp(), (req, res) => {
  const images = req.files.map(f => ({
    url: `/uploads/${f.filename}`,
    publicId: f.filename,
    alt: f.originalname,
  }));
  res.json({ success: true, images });
});

// Categories
const { createCategory, updateCategory, deleteCategory, getAdminCategories } = require('../controllers/categoryController');
router.get('/categories', getAdminCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Brands
const { createBrand, updateBrand, deleteBrand, getAdminBrands } = require('../controllers/brandController');
router.get('/brands', getAdminBrands);
router.post('/brands', createBrand);
router.put('/brands/:id', updateBrand);
router.delete('/brands/:id', deleteBrand);

// Orders
const { updateOrderDetails, updateOrderItems, getPackingSlip, updateOrderStatus, updatePaymentStatus, getAllOrders } = require('../controllers/orderController');
const { getOrderAttribution } = require('../controllers/orderAttributionController');
router.get('/orders', getAllOrders);
router.get('/orders/:id/attribution', getOrderAttribution);
router.get('/orders/:id/packing-slip', getPackingSlip);
router.put('/orders/:id/details', updateOrderDetails);
router.put('/orders/:id/items', updateOrderItems);
router.put('/orders/:id/status', updateOrderStatus);
router.put('/orders/:id/payment', updatePaymentStatus);

// Reviews
const { getAllReviews, updateReview, getReviewReports, updateReviewReport } = require('../controllers/reviewController');
router.get('/reviews', getAllReviews);
router.put('/reviews/:id', updateReview);
router.get('/reviews/reports', getReviewReports);
router.put('/reviews/reports/:id', updateReviewReport);

// Coupons
const { getCoupons, createCoupon, updateCoupon, deleteCoupon, getCouponRedemptions } = require('../controllers/couponController');
router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);
router.get('/coupons/:id/redemptions', getCouponRedemptions);

// Referral
const { createReferralCode, getReferralCodes, getReferralCode, updateReferralCode, deleteReferralCode, getReferralAnalytics, exportAnalytics } = require('../controllers/referralController');
router.get('/referral/codes', getReferralCodes);
router.post('/referral/codes', createReferralCode);
router.get('/referral/codes/:id', getReferralCode);
router.put('/referral/codes/:id', updateReferralCode);
router.delete('/referral/codes/:id', deleteReferralCode);
router.get('/referral/analytics', getReferralAnalytics);
router.get('/referral/analytics/export', exportAnalytics);

// Affiliate approvals, wallet accounting, and payout workflow
const affiliateController = require('../controllers/affiliateController');
router.get('/affiliate/program', affiliateController.getProgram);
router.put('/affiliate/program', affiliateController.updateProgram);
router.get('/affiliate/affiliates', affiliateController.listAffiliates);
router.put('/affiliate/affiliates/:id/status', affiliateController.updateAffiliateStatus);
router.get('/affiliate/payouts', affiliateController.listPayouts);
router.put('/affiliate/payouts/:id/process', affiliateController.processPayout);
router.put('/affiliate/payouts/:id/complete', affiliateController.completePayout);
router.put('/affiliate/payouts/:id/reject', affiliateController.rejectPayout);
router.post('/affiliate/ledger/adjust', affiliateController.adjustBalance);

// AI
const { analyzeProductImage, getAnalyzeProgress, regenerateContent, generateSEO, getAICredits } = require('../controllers/aiController');
router.post('/ai/analyze-image', uploadMemory.array('images', 10), analyzeProductImage);
router.get('/ai/analyze-progress/:id', getAnalyzeProgress);
router.post('/ai/regenerate', regenerateContent);
router.post('/ai/generate-seo', generateSEO);
router.get('/ai/credits', getAICredits);
const { getAIUsage, exportAIUsage } = require('../controllers/aiUsageController');
router.get('/ai-usage', getAIUsage);
router.get('/ai-usage/export', exportAIUsage);

// Reports (Excel)
const { generateReport, getReportTypes, previewReport } = require('../controllers/reportController');
router.get('/reports/types', getReportTypes);
router.get('/reports/preview', previewReport);
router.get('/reports/excel', generateReport);

// Site customization (banners, logo, favicon, social, contact)
const { getCustomization, updateCustomization, uploadSiteAsset, deleteSiteAsset } = require('../controllers/customizationController');
router.get('/customization', getCustomization);
router.put('/customization', updateCustomization);
router.post('/customization/upload', uploadMemory.single('file'), uploadSiteAsset);
router.post('/customization/upload-media', uploadMedia.single('file'), uploadSiteAsset);
router.delete('/customization/asset', deleteSiteAsset);

// Project media library. This is intentionally read/delete only; existing
// product, customization, and page-builder upload flows remain unchanged.
router.get('/storage', adminStorageController.listAssets);
router.get('/storage/thumbnail', adminStorageController.getThumbnail);
router.delete('/storage/bulk', adminStorageController.deleteAssets);
router.delete('/storage', adminStorageController.deleteAsset);

// Refunds
const { getRefunds, getRefundStats, getRefund, approveRefund, rejectRefund } = require('../controllers/refundController');
router.get('/refunds', getRefunds);
router.get('/refunds/stats', getRefundStats);
router.get('/refunds/:id', getRefund);
router.put('/refunds/:id/approve', approveRefund);
router.put('/refunds/:id/reject', rejectRefund);

// Returns / RMA workflow
const { getReturns, getReturn, updateReturnStatus } = require('../controllers/returnController');
router.get('/returns', getReturns);
router.get('/returns/:id', getReturn);
router.put('/returns/:id/status', updateReturnStatus);

// AI Conversations
const { getConversations, getConversation, updateConversation, getAnalytics: getConversationAnalytics } = require('../controllers/conversationController');
router.get('/conversations', getConversations);
router.get('/conversations/analytics', getConversationAnalytics);
router.get('/conversations/:id', getConversation);
router.put('/conversations/:id', updateConversation);

// Chatbot customization (admin)
const { getConfig: getChatbotConfigAdmin, updateConfig: updateChatbotConfigAdmin } = require('../controllers/chatbotConfigController');
router.get('/chatbot/config', getChatbotConfigAdmin);
router.put('/chatbot/config', updateChatbotConfigAdmin);

// Blog
const { getAdminPosts, getAdminPost, createPost, updatePost, deletePost, getAdminBlogCategories, createBlogCategory, updateBlogCategory, deleteBlogCategory, aiGenerateBlogPost } = require('../controllers/blogController');
router.get('/blog', getAdminPosts);
router.post('/blog', createPost);
router.post('/blog/ai-generate', aiGenerateBlogPost);
router.get('/blog/categories', getAdminBlogCategories);
router.post('/blog/categories', createBlogCategory);
router.put('/blog/categories/:id', updateBlogCategory);
router.delete('/blog/categories/:id', deleteBlogCategory);
router.get('/blog/:id', getAdminPost);
router.put('/blog/:id', updatePost);
router.delete('/blog/:id', deletePost);

// Abandoned Carts
const { getAbandonedCarts } = require('../controllers/abandonedCartController');
router.get('/abandoned-carts', getAbandonedCarts);

// ShipRocket Dashboard
const shiprocket = require('../controllers/shiprocketController');
router.use('/shiprocket', requireActiveProvider('shipping', 'shiprocket'));
router.get('/shiprocket/stats', shiprocket.getDashboardStats);
router.get('/shiprocket/orders', shiprocket.getShiprocketOrders);
router.post('/shiprocket/orders/:orderId/sync', shiprocket.syncOrderFromShiprocket);
router.post('/shiprocket/orders/:orderId/cancel', shiprocket.cancelShiprocketOrder);
router.post('/shiprocket/sync', shiprocket.bulkSyncOrders);
router.post('/shiprocket/ship', shiprocket.createShiprocketShipment);
router.get('/shiprocket/shipments', shiprocket.getShipments);
router.get('/shiprocket/track/shipment/:shipmentId', shiprocket.trackByShipmentId);
router.get('/shiprocket/track/:awbCode', shiprocket.trackShipment);
router.post('/shiprocket/labels', shiprocket.generateLabel);
router.post('/shiprocket/manifests', shiprocket.generateManifest);
router.post('/shiprocket/pickup', shiprocket.requestPickup);
router.post('/shiprocket/assign-courier', shiprocket.assignCourier);
router.post('/shiprocket/rates', shiprocket.getRates);
router.get('/orders/:id/shipping-options', requireActiveProvider('shipping', 'shiprocket'), shiprocket.getOrderShippingOptions);
router.post('/orders/:id/ship', requireActiveProvider('shipping', 'shiprocket'), shiprocket.shipOrderWithCourier);
router.get('/shiprocket/pickup-locations', shiprocket.getPickupLocations);
router.post('/shiprocket/pickup-locations', shiprocket.addPickupLocation);
router.post('/shiprocket/returns', shiprocket.createReturn);
router.get('/shiprocket/ndr', shiprocket.getNDRShipments);
router.get('/shiprocket/channels', shiprocket.getChannels);
router.get('/shiprocket/cod', shiprocket.getCODOrders);
router.post('/shiprocket/invoice', shiprocket.generateInvoice);

// Courier Management (under Shiprocket)
const courier = require('../controllers/courierManagementController');
router.get('/shiprocket/couriers', courier.listCouriers);
router.post('/shiprocket/couriers/refresh', courier.refreshCouriers);
router.patch('/shiprocket/couriers/priority', courier.reorderCouriers);
router.get('/shiprocket/couriers/rules', courier.listRules);
router.post('/shiprocket/couriers/rules', courier.createRule);
router.patch('/shiprocket/couriers/rules/:id', courier.updateRule);
router.delete('/shiprocket/couriers/rules/:id', courier.deleteRule);
router.get('/shiprocket/couriers/activity', courier.listActivity);
router.get('/shiprocket/couriers/auto-assign', courier.getAutoAssignSettings);
router.patch('/shiprocket/couriers/auto-assign', courier.updateAutoAssignSettings);
router.post('/shiprocket/couriers/auto-assign/run', courier.runAutoAssignNow);
router.get('/shiprocket/couriers/stressed', courier.getStressedCouriers);
router.patch('/shiprocket/couriers/stressed/thresholds', courier.updateStressThresholds);
router.patch('/shiprocket/couriers/stressed/:id', courier.toggleManualStress);
router.post('/shiprocket/couriers/metrics/recompute', courier.recomputeMetrics);
// Per-courier toggle LAST so it doesn't capture /rules, /priority, /stressed, /auto-assign, etc.
router.patch('/shiprocket/couriers/:id', courier.toggleCourier);

// Razorpay Dashboard
const razorpay = require('../controllers/razorpayController');
router.use('/razorpay', requireActiveProvider('payment', 'razorpay'));
router.get('/razorpay/stats', razorpay.getDashboardStats);
router.get('/razorpay/payments', razorpay.getPayments);
router.get('/razorpay/payments/:id', razorpay.getPayment);
router.get('/razorpay/orders', razorpay.getOrders);
router.get('/razorpay/refunds', razorpay.getRefunds);
router.post('/razorpay/refunds', razorpay.createRefund);
router.get('/razorpay/settlements', razorpay.getSettlements);
router.get('/razorpay/settlements/:id', razorpay.getSettlement);
router.post('/razorpay/settlements/reconcile', razorpay.reconcileSettlement);
router.post('/razorpay/payments/:id/capture', razorpay.capturePayment);

// Click Tracking
const { getClickAnalytics, getAISummary } = require('../controllers/clickTrackingController');
router.get('/click-tracking', getClickAnalytics);
router.post('/click-tracking/summary', getAISummary);

// Legal Pages
const { getAllLegalPages, updateLegalPage } = require('../controllers/legalController');
router.get('/legal-pages', getAllLegalPages);
router.put('/legal-pages/:slug', updateLegalPage);

// SEO Dashboard
const { getSeoSettings, updateSeoSettings, aiGenerateSeo, aiSeoAudit, getContentSeoStats, updateItemSeo, generateItemSeo, bulkGenerateSeo } = require('../controllers/seoController');
router.get('/seo', getSeoSettings);
router.put('/seo', updateSeoSettings);
router.post('/seo/ai-generate', aiGenerateSeo);
router.post('/seo/ai-audit', aiSeoAudit);
router.get('/seo/content-stats', getContentSeoStats);
router.put('/seo/item/:type/:id', updateItemSeo);
router.post('/seo/item/:type/:id/generate', generateItemSeo);
router.post('/seo/bulk-generate', bulkGenerateSeo);

// Google Merchant Center + Google Ads conversion settings
const { getMerchantSettingsAdmin, updateMerchantSettings, generateFeedKey } = require('../controllers/googleMerchantController');
router.get('/google-merchant', getMerchantSettingsAdmin);
router.put('/google-merchant', updateMerchantSettings);
router.post('/google-merchant/generate-key', generateFeedKey);

// Page Builder
const {
  listPages, getPage, createPage, updatePage,
  publishPage, discardDraft, duplicatePage, archivePage, unarchivePage, hardDeletePage,
  listVersions, getVersion, rollbackVersion, schedulePublish, previewToken,
} = require('../controllers/pageController');
const { aiEditPage } = require('../controllers/pageBuilderAIController');
const { rollbackPageBuilderCheckpoint } = require('../controllers/pageBuilderCheckpointController');

// Page builder admin endpoints
router.get('/pages', listPages);
router.post('/pages', createPage);
router.get('/pages/:id', getPage);
router.put('/pages/:id', updatePage);
router.post('/pages/:id/ai-edit', aiEditPage);
router.post('/pages/:id/ai-checkpoints/:checkpointId/rollback', rollbackPageBuilderCheckpoint);
router.delete('/pages/:id', archivePage);
router.delete('/pages/:id/permanent', hardDeletePage);
router.post('/pages/:id/unarchive', unarchivePage);
router.post('/pages/:id/publish', publishPage);
router.post('/pages/:id/discard-draft', discardDraft);
router.post('/pages/:id/duplicate', duplicatePage);
router.post('/pages/:id/schedule', schedulePublish);
router.get('/pages/:id/versions', listVersions);
router.get('/pages/:id/versions/:versionId', getVersion);
router.post('/pages/:id/rollback/:versionId', rollbackVersion);
router.get('/pages/preview-token/:id', previewToken);
const { listPageBlocks, createPageBlock, archivePageBlock } = require('../controllers/pageBlockController');
router.get('/page-blocks', listPageBlocks);
router.post('/page-blocks', createPageBlock);
router.delete('/page-blocks/:id', archivePageBlock);
const { listTemplateVersions, createTemplateVersion, restoreTemplateVersion } = require('../controllers/templateController');
router.get('/templates/:id/versions', listTemplateVersions);
router.post('/templates/:id/versions', createTemplateVersion);
router.post('/templates/:id/versions/:versionId/restore', restoreTemplateVersion);
// Reuse existing /api/admin/customization/upload for image uploads — no new route needed

// Newsletter (admin)
const { listSubscribers: listNewsletterSubscribers } = require('../controllers/newsletterController');
router.get('/newsletter', listNewsletterSubscribers);

// Multi-Vendor
router.use('/', adminVendorRoutes);

// Commission management
const { updateCategoryCommission, updateDefaultCommission } = require('../controllers/adminController');
router.put('/categories/:id/commission', updateCategoryCommission);
router.put('/settings/commission-default', updateDefaultCommission);

module.exports = router;
