const mongoose = require('mongoose');

const marketplaceOrderItemSchema = new mongoose.Schema({
  sku: String,
  title: String,
  quantity: Number,
  price: Number,
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
}, { _id: false });

const marketplaceOrderSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  connection: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketplaceConnection', required: true },
  provider: { type: String, enum: ['amazon', 'flipkart'], required: true },
  remoteOrderId: { type: String, required: true },
  remoteShipmentId: String,
  status: String,
  fulfillmentStatus: String,
  orderDate: Date,
  currency: String,
  total: Number,
  items: [marketplaceOrderItemSchema],
  buyerDisplay: String,
  shippingSummary: mongoose.Schema.Types.Mixed,
  localOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  raw: mongoose.Schema.Types.Mixed,
  restrictedDataRequired: { type: Boolean, default: false },
  lastSyncedAt: Date,
  importedAt: { type: Date, default: Date.now },
}, { timestamps: true });

marketplaceOrderSchema.index({ connection: 1, remoteOrderId: 1 }, { unique: true });
marketplaceOrderSchema.index({ provider: 1, status: 1, orderDate: -1 });
marketplaceOrderSchema.index({ vendor: 1, orderDate: -1 });

module.exports = mongoose.model('MarketplaceOrder', marketplaceOrderSchema);
