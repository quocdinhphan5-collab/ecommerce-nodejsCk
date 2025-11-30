const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  fullName: { type: String },
  phone: { type: String },
  province: { type: String },
  district: { type: String },
  ward: { type: String },
  street: { type: String },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // quyền & trạng thái tài khoản
  role:     { type: String, default: 'user' },  
  isActive: { type: Boolean, default: true },  

  // địa chỉ 
  address:  { type: String },

  // danh sách địa chỉ chi tiết
  addresses: {
    type: [addressSchema],
    default: [],
  },

  // điểm thưởng khách hàng thân thiết
  loyaltyPoints: { type: Number, default: 0 },

  // dùng cho quên mật khẩu
  resetCode:        { type: String },
  resetCodeExpires: { type: Date },

  createdAt: { type: Date, default: Date.now },
});

// Hash mật khẩu trước khi lưu
userSchema.pre('save', async function save(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

// tiện dùng khi cần tự hash ở chỗ khác
userSchema.statics.hashPassword = async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
};

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
