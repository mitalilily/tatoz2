// Route-level feature gate for vendor modules. vendorAuth must run before this
// middleware so req.vendor is already the authenticated, active tenant.
const vendorFeature = (feature) => (req, res, next) => {
  if (req.vendor?.features?.[feature] === false) {
    res.status(403);
    return next(new Error(`The ${feature} module is disabled for this vendor account`));
  }
  next();
};

module.exports = vendorFeature;
