const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isAdmin: { type: Boolean, default: false },
  text: { type: String, required: true, maxLength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

const productQuestionSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: String, required: true, maxLength: 500 },
  answers: [answerSchema],
  upvotes: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'hidden'], default: 'active' },
}, { timestamps: true });

productQuestionSchema.index({ product: 1, createdAt: -1 });

module.exports = mongoose.model('ProductQuestion', productQuestionSchema);
