function validateCountdown(data = {}) {
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    subheading: typeof data.subheading === 'string' ? data.subheading : '',
    endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : '',
    ctaLabel: typeof data.ctaLabel === 'string' ? data.ctaLabel : '',
    ctaLink: typeof data.ctaLink === 'string' ? data.ctaLink : '',
    backgroundColor: typeof data.backgroundColor === 'string' ? data.backgroundColor : '#dc2626',
    textColor: typeof data.textColor === 'string' ? data.textColor : '#ffffff',
    expiredMessage: typeof data.expiredMessage === 'string' ? data.expiredMessage : 'Sale has ended',
  };
}
module.exports = { validateCountdown };
