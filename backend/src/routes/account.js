const express = require('express');
const router = express.Router();
const User = require('../models/User');

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?redirect=/account/addresses');
  }
  next();
}

// Xem & quản lý địa chỉ
router.get('/account/addresses', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  const error = req.query.error || null;
  const success = req.query.success || null;

  res.render('pages/account-addresses', {
    title: 'Địa chỉ giao hàng',
    user,
    error,
    success,
  });
});

// Thêm địa chỉ mới 
router.post('/account/addresses', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    const { fullName, phone, province, district, ward, street, isDefault } = req.body;

    // Giới hạn tối đa 3 địa chỉ
    if (user.addresses.length >= 3) {
      return res.redirect('/account/addresses?error=Bạn chỉ được lưu tối đa 3 địa chỉ giao hàng. Vui lòng xóa hoặc sửa một địa chỉ hiện có.');
    }

    if (isDefault) {
      user.addresses.forEach((addr) => (addr.isDefault = false));
    }

    user.addresses.push({
      fullName,
      phone,
      province,
      district,
      ward,
      street,
      isDefault: !!isDefault,
    });

    await user.save();
    return res.redirect('/account/addresses?success=Đã thêm địa chỉ mới');
  } catch (err) {
    console.error(err);
    res.redirect('/account/addresses?error=Lỗi khi thêm địa chỉ');
  }
});

// Cập nhật địa chỉ 
router.post('/account/addresses/:id/update', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    const addrId = req.params.id;
    const { fullName, phone, province, district, ward, street, isDefault } = req.body;

    const addr = user.addresses.id(addrId);
    if (!addr) {
      return res.redirect('/account/addresses?error=Không tìm thấy địa chỉ cần sửa');
    }

    if (isDefault) {
      user.addresses.forEach((a) => (a.isDefault = false));
    }

    addr.fullName = fullName;
    addr.phone = phone;
    addr.province = province;
    addr.district = district;
    addr.ward = ward;
    addr.street = street;
    addr.isDefault = !!isDefault;

    await user.save();
    return res.redirect('/account/addresses?success=Đã cập nhật địa chỉ');
  } catch (err) {
    console.error(err);
    res.redirect('/account/addresses?error=Lỗi khi cập nhật địa chỉ');
  }
});

// Xóa địa chỉ
router.post('/account/addresses/:id/delete', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    user.addresses = user.addresses.filter(
      (addr) => addr._id.toString() !== req.params.id
    );
    await user.save();
    return res.redirect('/account/addresses?success=Đã xóa địa chỉ');
  } catch (err) {
    console.error(err);
    res.redirect('/account/addresses?error=Lỗi khi xóa địa chỉ');
  }
});

module.exports = router;
