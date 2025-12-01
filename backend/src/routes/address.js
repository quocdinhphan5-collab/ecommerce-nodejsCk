const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { ensureAuth } = require("../middleware/auth");

// Danh sách địa chỉ
router.get("/", ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  if (user && !Array.isArray(user.addresses)) {
    user.addresses = [];
  }
  res.render("pages/address", {
    title: "Địa chỉ giao hàng",
    addresses: user ? user.addresses : []
  });
});

// Thêm địa chỉ mới
router.post("/add", ensureAuth, async (req, res) => {
  const { fullName, phone, addressLine, ward, district, province, isDefault } = req.body;
  const user = await User.findById(req.session.user._id);

  if (!Array.isArray(user.addresses)) {
    user.addresses = [];
  }

  // Nếu chọn mặc định -> reset các địa chỉ cũ
  if (isDefault === "on") {
    user.addresses.forEach(a => (a.isDefault = false));
  }

  user.addresses.push({
    fullName,
    phone,
    addressLine,
    ward,
    district,
    province,
    isDefault: isDefault === "on"
  });

  await user.save();
  res.redirect("/address");
});

// Đặt làm mặc định
router.get("/set-default/:index", ensureAuth, async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const user = await User.findById(req.session.user._id);

  if (user && Array.isArray(user.addresses) && user.addresses[index]) {
    user.addresses.forEach((a, i) => (a.isDefault = i === index));
    await user.save();
  }

  res.redirect("/address");
});

// XOÁ địa chỉ (POST)
router.post("/:index/delete", ensureAuth, async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const user = await User.findById(req.session.user._id);

  if (user && Array.isArray(user.addresses) && user.addresses[index]) {
    user.addresses.splice(index, 1);

    // Nếu sau khi xoá không còn địa chỉ nào là mặc định -> set địa chỉ đầu tiên
    if (user.addresses.length > 0 && !user.addresses.some(a => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
  }

  res.redirect("/address");
});

// FORM SỬA địa chỉ
router.get("/:index/edit", ensureAuth, async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const user = await User.findById(req.session.user._id);

  if (!user || !Array.isArray(user.addresses) || !user.addresses[index]) {
    return res.redirect("/address");
  }

  const addr = user.addresses[index];

  res.render("pages/address-edit", {
    title: "Sửa địa chỉ",
    address: addr,
    index
  });
});

// XỬ LÝ SỬA địa chỉ
router.post("/:index/edit", ensureAuth, async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const user = await User.findById(req.session.user._id);

  if (!user || !Array.isArray(user.addresses) || !user.addresses[index]) {
    return res.redirect("/address");
  }

  const addr = user.addresses[index];
  const { fullName, phone, addressLine, ward, district, province, isDefault } = req.body;

  addr.fullName = fullName;
  addr.phone = phone;
  addr.addressLine = addressLine;
  addr.ward = ward;
  addr.district = district;
  addr.province = province;

  if (isDefault === "on") {
    user.addresses.forEach((a, i) => (a.isDefault = i === index));
  }

  await user.save();
  res.redirect("/address");
});

module.exports = router;