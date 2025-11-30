const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true },     
  price: { type: Number, required: true },      
  stock: { type: Number, required: true, default: 0 }, 
});

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  name: { type: String, required: true },     
  rating: { type: Number, min: 1, max: 5 },     
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const productSchema = new mongoose.Schema({
  name: String,
  brand: String,
  category: String,
  price: Number,               
  description: String,        
  images: [String],           
  variants: [variantSchema],     
  reviews: [reviewSchema],
  averageRating: { type: Number, default: 0 },
  numRatings: { type: Number, default: 0 },
});

module.exports = mongoose.model('Product', productSchema);
