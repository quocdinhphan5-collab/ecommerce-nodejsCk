const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  variantIndex: { type: Number },    
  name: String,
  variantName: String,
  price: Number,
  quantity: { type: Number, default: 1 },
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    unique: true,      
    required: true,
  },
  items: {
    type: [cartItemSchema],
    default: [],
  },
  total: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

cartSchema.methods.recalcTotal = function () {
  this.total = this.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
};

module.exports = mongoose.model('Cart', cartSchema);
