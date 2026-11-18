const Product = require('../models/Product');
const { addApprovedProductFilter } = require('./productApprovalService');

const tenantIdOf = tenant => tenant?._id || tenant || null;

const productIdsFromUser = user => (user?.wishlist || [])
  .map(item => item?._id || item)
  .filter(Boolean);

const getTenantWishlistProducts = async ({ user, tenant }) => {
  const productIds = productIdsFromUser(user);
  if (!productIds.length) return [];

  const tenantId = tenantIdOf(tenant);
  const productQuery = {
    _id: { $in: productIds },
    ...(tenantId ? { tenant: tenantId } : {}),
  };
  addApprovedProductFilter(productQuery);
  const products = await Product.find(productQuery)
    .select('title slug thumbnail images price comparePrice discount variants stock isActive tenant')
    .lean();
  const byId = new Map(products.map(product => [String(product._id), product]));
  return productIds.map(id => byId.get(String(id))).filter(Boolean);
};

const getTenantWishlistIds = async ({ user, tenant }) => {
  const products = await getTenantWishlistProducts({ user, tenant });
  return products.map(product => product._id);
};

module.exports = { getTenantWishlistProducts, getTenantWishlistIds };
