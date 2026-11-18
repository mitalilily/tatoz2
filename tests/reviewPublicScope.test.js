const mongoose = require('mongoose');
const { optionalTenantFilter } = require('../services/publicScope');

// Public review reads must stay tenant-agnostic when no tenant resolved
// (same contract as the product catalogue). Otherwise genuine tenant-scoped
// reviews vanish on every storefront host that is not a verified tenant
// domain — the "No written reviews yet" regression.
describe('optionalTenantFilter', () => {
  test('returns no tenant constraint when tenant is unresolved', () => {
    expect(optionalTenantFilter(undefined)).toEqual({});
    expect(optionalTenantFilter(null)).toEqual({});
  });

  test('scopes to the tenant when one is resolved', () => {
    const id = new mongoose.Types.ObjectId();
    expect(optionalTenantFilter({ _id: id })).toEqual({ tenant: id });
  });

  test('accepts a raw tenant id', () => {
    const id = new mongoose.Types.ObjectId();
    expect(optionalTenantFilter(id)).toEqual({ tenant: id });
    expect(optionalTenantFilter(String(id))).toEqual({ tenant: String(id) });
  });

  test('public review filter matches tenant-scoped reviews on unknown hosts', () => {
    const productId = new mongoose.Types.ObjectId();
    const filter = { product: productId, status: 'approved', ...optionalTenantFilter(undefined) };
    expect(filter).toEqual({ product: productId, status: 'approved' });
    expect(filter.tenant).toBeUndefined();
  });

  test('public review filter stays scoped on known tenant hosts', () => {
    const productId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const filter = { product: productId, status: 'approved', ...optionalTenantFilter({ _id: tenantId }) };
    expect(filter).toEqual({ product: productId, status: 'approved', tenant: tenantId });
  });
});
