const { buildStylishDescription, escapeHtml } = require('../scripts/restyleProductDescriptions');

const sample = {
  title: 'Dri-FIT Running T-Shirt',
  brand: 'Nike',
  categorySlug: 'apparel',
  shortDescription: 'Nike Dri-FIT Running T-Shirt. Ships fast across India.',
  tags: ['running', 'sportswear', 'mesh'],
  specifications: [
    { key: 'Material', value: 'Premium cotton blend' },
    { key: 'Fit', value: 'Regular fit' },
  ],
  variants: [{ name: 'Size', options: [{ value: 'S' }, { value: 'M' }] }],
};

describe('buildStylishDescription', () => {
  test('embeds product-specific content', () => {
    const html = buildStylishDescription(sample, 'Apparel');
    expect(html).toContain('Dri-FIT Running T-Shirt');
    expect(html).toContain('Nike');
    expect(html).toContain('Apparel');
    expect(html).toContain('Premium cotton blend');
    expect(html).toContain('running');
    expect(html).toContain('<style>');
    expect(html).toContain('pdesc-hero');
  });

  test('escapes HTML in product data', () => {
    const evil = { ...sample, title: '<script>alert(1)</script>', brand: 'B"<b>' };
    const html = buildStylishDescription(evil, 'Apparel');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain(escapeHtml('B"<b>'));
  });

  test('handles missing optional fields without crashing', () => {
    const html = buildStylishDescription({ title: 'X' }, '');
    expect(html).toContain('X');
    expect(html).toContain('General');
  });

  test('uses no external resources', () => {
    const html = buildStylishDescription(sample, 'Apparel');
    expect(html).not.toMatch(/src=|href=|@import|url\(http/i);
  });
});
