const { normalizeProductCRO, validateProductPayload } = require('../utils/adminValidation');

describe('CRO live-counter ranges', () => {
  test('min/max default to zero and legacy fixed values survive', () => {
    const cro = normalizeProductCRO({
      socialProof: { enabled: true, count: 42 },
      stockDisplay: { enabled: true, value: 9 },
      soldDisplay: { enabled: true, count: 31 },
      visitorDisplay: { enabled: true, count: 17 },
    });
    expect(cro.socialProof).toMatchObject({ count: 42, min: 0, max: 0 });
    expect(cro.stockDisplay).toMatchObject({ value: 9, min: 0, max: 0 });
    expect(cro.soldDisplay).toMatchObject({ count: 31, min: 0, max: 0 });
    expect(cro.visitorDisplay).toMatchObject({ count: 17, min: 0, max: 0 });
  });

  test('explicit ranges pass through as integers', () => {
    const cro = normalizeProductCRO({
      socialProof: { enabled: true, min: '30', max: '48' },
      stockDisplay: { enabled: true, min: 6, max: 12 },
      soldDisplay: { enabled: true, min: 20, max: 40 },
      visitorDisplay: { enabled: true, min: 10, max: 25 },
    });
    expect(cro.socialProof).toMatchObject({ min: 30, max: 48 });
    expect(cro.stockDisplay).toMatchObject({ min: 6, max: 12 });
    expect(cro.soldDisplay).toMatchObject({ min: 20, max: 40 });
    expect(cro.visitorDisplay).toMatchObject({ min: 10, max: 25 });
  });

  test('negative range bounds are rejected', () => {
    expect(() => normalizeProductCRO({ socialProof: { min: -1 } })).toThrow();
    expect(() => normalizeProductCRO({ visitorDisplay: { max: -5 } })).toThrow();
  });

  test('ranges survive the full product payload validator', () => {
    const out = validateProductPayload({
      title: 'Range Tee',
      price: 799,
      stock: 50,
      cro: {
        socialProof: { enabled: true, min: 35, max: 48 },
        stockDisplay: { enabled: true, min: 6, max: 12 },
        soldDisplay: { enabled: true, min: 25, max: 40 },
        visitorDisplay: { enabled: true, min: 12, max: 24 },
      },
    });
    expect(out.cro.socialProof).toMatchObject({ min: 35, max: 48 });
    expect(out.cro.stockDisplay).toMatchObject({ min: 6, max: 12 });
    expect(out.cro.soldDisplay).toMatchObject({ min: 25, max: 40 });
    expect(out.cro.visitorDisplay).toMatchObject({ min: 12, max: 24 });
  });
});
