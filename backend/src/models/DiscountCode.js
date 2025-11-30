const mongoose = require('mongoose');

const discountCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // 5-char alphanumeric
    discountValue: { type: Number, required: true }, // tiền giảm trực tiếp
    usageCount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: 10 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DiscountCode', discountCodeSchema);