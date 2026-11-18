const mongoose = require('mongoose');

const localeOptionSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, maxlength: 20 },
  label: { type: String, required: true, trim: true, maxlength: 80 },
  enabled: { type: Boolean, default: true },
}, { _id: false });

const currencyOptionSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3 },
  symbol: { type: String, required: true, trim: true, maxlength: 8 },
  locale: { type: String, trim: true, maxlength: 20 },
  // 1 unit of base currency = rateFromBase units of this display currency.
  rateFromBase: { type: Number, required: true, min: 0.000001 },
  decimals: { type: Number, min: 0, max: 4, default: 2 },
  enabled: { type: Boolean, default: true },
}, { _id: false });

const storefrontLocaleConfigSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
  baseCurrency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3, default: 'INR' },
  defaultCurrency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3, default: 'INR' },
  defaultLocale: { type: String, required: true, trim: true, maxlength: 20, default: 'en-IN' },
  supportedLocales: { type: [localeOptionSchema], default: [] },
  supportedCurrencies: { type: [currencyOptionSchema], default: [] },
  rateSource: { type: String, trim: true, maxlength: 160 },
  ratesUpdatedAt: { type: Date },
  ratesDate: { type: String, trim: true, maxlength: 20 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('StorefrontLocaleConfig', storefrontLocaleConfigSchema);
