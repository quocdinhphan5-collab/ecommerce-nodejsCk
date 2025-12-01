const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  variantName: String,
  variantIndex: { type: Number },  
  price: Number,
  quantity: Number,
});

const statusHistorySchema = new mongoose.Schema({
  status: String,
  updatedAt: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    shippingAddress: String,
    items: [orderItemSchema],
    totalAmount: Number,
    discountCode: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscountCode', default: null },
    discountValue: { type: Number, default: 0 },
    usedLoyaltyPoints: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Shipping', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
    history: [statusHistorySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);