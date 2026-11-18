function validateNewsletter(data = {}) {
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    subheading: typeof data.subheading === 'string' ? data.subheading : '',
    placeholder: typeof data.placeholder === 'string' ? data.placeholder : 'you@example.com',
    buttonLabel: typeof data.buttonLabel === 'string' ? data.buttonLabel : 'Subscribe',
    successMessage: typeof data.successMessage === 'string' ? data.successMessage : 'Thanks — you\'re subscribed!',
    style: ['inline', 'card', 'wide'].includes(data.style) ? data.style : 'card',
  };
}
module.exports = { validateNewsletter };
