const mongoose = require('mongoose');
const crypto = require('crypto');

const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'pickup_scheduled',
  'picked_up',
  'received',
  'inspection_pending',
  'approved_for_refund',
  'replacement_queued',
  'refunded',
  'replaced',
  'closed',
  'cancelled',
];

const returnItemSchema = new mongoose.Schema({
  orderItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemType: { type: String, enum: ['product', 'bundle_component'], default: 'product' },
  componentIndex: { type: Number, min: 0 },
  componentType: { type: String, enum: ['component', 'reward'], default: 'component' },
  bundleName: String,
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  title: String,
  image: String,
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  variant: mongoose.Schema.Types.Mixed,
  sku: String,
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const returnRequestSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  requestNumber: { type: String, required: true, unique: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['return', 'replacement', 'exchange'],
    default: 'return',
    required: true,
  },
  status: { type: String, enum: RETURN_STATUSES, default: 'requested', index: true },
  reason: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000 },
  items: { type: [returnItemSchema], required: true, validate: value => Array.isArray(value) && value.length > 0 },
  requestedAmount: { type: Number, required: true, min: 0 },
  approvedAmount: { type: Number, min: 0 },
  images: [{ url: String, publicId: String }],
  pickupAddress: mongoose.Schema.Types.Mixed,
  pickupScheduledAt: Date,
  pickedUpAt: Date,
  receivedAt: Date,
  trackingNumber: String,
  courierName: String,
  adminNote: { type: String, trim: true, maxlength: 2000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  closedAt: Date,
  statusHistory: [{
    from: String,
    to: { type: String, required: true },
    note: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

returnRequestSchema.pre('validate', function preValidate(next) {
  if (!this.requestNumber) {
    const date = new Date();
    const prefix = `RMA${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    this.requestNumber = `${prefix}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  }
  next();
});

returnRequestSchema.index({ tenant: 1, createdAt: -1 });
returnRequestSchema.index({ tenant: 1, order: 1, status: 1 });
returnRequestSchema.index({ tenant: 1, user: 1, createdAt: -1 });

returnRequestSchema.statics.statuses = RETURN_STATUSES;

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
