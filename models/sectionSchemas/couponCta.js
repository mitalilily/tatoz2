function validateCouponCta(data = {}) {
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    subheading: typeof data.subheading === 'string' ? data.subheading : '',
    code: typeof data.code === 'string' ? data.code.toUpperCase().slice(0, 32) : '',
    ctaLabel: typeof data.ctaLabel === 'string' ? data.ctaLabel : '',
    ctaLink: typeof data.ctaLink === 'string' ? data.ctaLink : '',
    backgroundColor: typeof data.backgroundColor === 'string' ? data.backgroundColor : '#fef3c7',
    textColor: typeof data.textColor === 'string' ? data.textColor : '#92400e',
  };
}
module.exports = { validateCouponCta };
