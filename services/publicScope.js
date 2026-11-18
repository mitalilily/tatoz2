// Public storefront reads serve the resolved tenant when one is known and stay
// tenant-agnostic otherwise — the same contract as the product catalogue
// (see getProducts/getProductBySlug). Unknown hosts must still see genuine
// tenant-scoped reviews instead of matching only legacy tenantless records.
const optionalTenantFilter = (tenant) => {
  const id = tenant && typeof tenant === 'object' ? tenant._id || tenant : tenant;
  return id ? { tenant: id } : {};
};

module.exports = { optionalTenantFilter };
