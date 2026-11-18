const User = require('../models/User');
const Vendor = require('../models/Vendor');

describe('email validation allows modern TLDs', () => {
  test('User accepts 4+ letter TLDs like .shop', () => {
    const err = new User({ email: 'admin@tatoz.com' }).validateSync('email');
    expect(err).toBeUndefined();
  });

  test('User still accepts common TLDs', () => {
    for (const email of ['a@b.com', 'a@b.co.in', 'a.b-c@d-e.org']) {
      expect(new User({ email }).validateSync('email')).toBeUndefined();
    }
  });

  test('User still rejects malformed emails', () => {
    for (const email of ['not-an-email', 'a@b', 'a@.com', '@b.com']) {
      expect(new User({ email }).validateSync('email')).toBeDefined();
    }
  });

  test('Vendor contactEmail accepts .shop', () => {
    const err = new Vendor({ contactEmail: 'care@tatoz.com' }).validateSync('contactEmail');
    expect(err).toBeUndefined();
  });
});
