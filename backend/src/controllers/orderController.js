const Order = require('../models/Order');
const DiscountCode = require('../models/DiscountCode');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { sendOrderConfirmationMail } = require('../utils/mailer');

function ensureCart(req) {
  if (!req.session.cart) {
    req.session.cart = { items: [], total: 0 };
  }
}

/**
 * GET /checkout
 * Hiển thị trang thanh toán
 */
async function viewCheckout(req, res) {
  try {
    ensureCart(req);
    if (!req.session.cart.items.length) {
      return res.redirect('/cart');
    }

    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user._id);
      if (user) {
        if (!Array.isArray(user.addresses)) {
          user.addresses = [];
        }

        if (user.addresses.length > 5) {
          user.addresses = user.addresses.slice(0, 5);
          await user.save();
        }
      }
    }

    res.locals.currentUser = user || null;

    res.render('pages/checkout', {
      title: 'Thanh toán',
      cart: req.session.cart,
      user,
      discountInfo: null,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Lỗi server khi mở trang thanh toán');
  }
}

/**
 * POST /checkout
 * Xử lý đặt hàng
 */
async function postCheckout(req, res) {
  ensureCart(req);
  if (!req.session.cart.items.length) {
    return res.redirect('/cart');
  }

  try {
    const {
      fullName,
      email,
      shippingAddress, 
      new_addressLine,
      new_province,
      new_district,
      new_ward,
      discountCode,
      usePoints,
    } = req.body;

    let user = null;

    // 1. Lấy user từ session nếu có
    if (req.session.user) {
      user = await User.findById(req.session.user._id);
      if (!user) {
        req.session.user = null;
      }
    }

    // 2. Nếu chưa có user -> tìm theo email -> nếu chưa có nữa thì tạo
    if (!user) {
      user = await User.findOne({ email });
      if (!user) {
        const randomPass = Math.random().toString(36).slice(-8);
        user = new User({
          fullName,
          email,
          password: randomPass,
        });
        await user.save();
      }

      req.session.user = {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints,
      };
    } else {
      // Cập nhật lại tên theo form
      user.fullName = fullName;
      await user.save();
      req.session.user.fullName = fullName;
    }

    if (!Array.isArray(user.addresses)) {
      user.addresses = [];
    }

    // 3. Xác định địa chỉ giao hàng dạng text
    let shippingAddressText = '';

    // 3.1 Chọn 1 địa chỉ đã lưu
    if (
      shippingAddress &&
      shippingAddress !== 'new' &&
      user.addresses.length > 0
    ) {
      const index = parseInt(shippingAddress, 10);
      if (!Number.isNaN(index) && user.addresses[index]) {
        const addr = user.addresses[index];
        shippingAddressText = `${addr.addressLine}, ${addr.ward}, ${addr.district}, ${addr.province}`;
      }
    }

    // 3.2 Nếu vẫn chưa có, dùng địa chỉ mới
    if (!shippingAddressText) {
      if (
        !new_addressLine ||
        !new_province ||
        !new_district ||
        !new_ward
      ) {
        return res.status(400).send('Thiếu thông tin địa chỉ giao hàng mới');
      }

      shippingAddressText = `${new_addressLine}, ${new_ward}, ${new_district}, ${new_province}`;

      // Lưu thêm địa chỉ nếu chưa vượt quá 5
      if (user.addresses.length < 5) {
        user.addresses.push({
          fullName: fullName,
          phone: user.phone || '',
          addressLine: new_addressLine,
          ward: new_ward,
          district: new_district,
          province: new_province,
          isDefault: user.addresses.length === 0,
        });
        await user.save();
        req.session.user.loyaltyPoints = user.loyaltyPoints;
      } else {
        console.log('User đã có tối đa 5 địa chỉ, không lưu thêm.');
      }
    }

    if (!shippingAddressText.trim()) {
      return res.status(400).send('Thiếu địa chỉ giao hàng');
    }

    // 4. Xử lý mã giảm giá
    let discountDoc = null;
    let discountValue = 0;
    if (discountCode) {
      const code = discountCode.trim().toUpperCase();
      discountDoc = await DiscountCode.findOne({ code });
      if (discountDoc && discountDoc.usageCount < discountDoc.usageLimit) {
        discountValue = discountDoc.discountValue;
      } else {
        discountDoc = null;
      }
    }

    // 5. Tính toán tiền
    const cart = req.session.cart;
    const subtotal = cart.total || 0;
    const tax = Math.round(subtotal * 0.1); // VAT 10%
    const shippingFee = subtotal >= 2000000 ? 0 : 50000;
    const totalBefore = subtotal + tax + shippingFee;

    let usedPoints = 0;
    let usedPointsValue = 0;

    if (usePoints && user.loyaltyPoints > 0) {
      usedPoints = user.loyaltyPoints;
      usedPointsValue = usedPoints * 1000;

      const maxDiscountFromPoints = Math.max(0, totalBefore - discountValue);
      if (usedPointsValue > maxDiscountFromPoints) {
        usedPointsValue = maxDiscountFromPoints;
        usedPoints = Math.floor(usedPointsValue / 1000);
      }
    }

    let total = totalBefore - discountValue - usedPointsValue;
    if (total < 0) total = 0;

    // 6. Tạo đơn hàng
    const order = new Order({
      user: user._id,
      email: user.email,
      shippingAddress: shippingAddressText,
      items: cart.items.map((it) => ({
        product: it.productId,
        name: it.name,
        variantName: it.variantName,
        variantIndex: it.variantIndex,
        price: it.price,
        quantity: it.quantity,
      })),
      totalAmount: total,
      discountCode: discountDoc ? discountDoc._id : null,
      discountValue,
      usedLoyaltyPoints: usedPoints,
      status: 'Pending',
      history: [{ status: 'Pending', updatedAt: new Date() }],
    });

    await order.save();

    // 7. Cập nhật usage mã giảm giá
    if (discountDoc && discountValue > 0) {
      discountDoc.usageCount += 1;
      await discountDoc.save();
    }

    // 8. Cập nhật điểm thưởng
    const earnPoints = Math.floor((subtotal * 0.1) / 1000);
    user.loyaltyPoints = Math.max(
      0,
      user.loyaltyPoints - usedPoints + earnPoints
    );
    await user.save();
    req.session.user.loyaltyPoints = user.loyaltyPoints;

    // 9. Gửi email xác nhận đơn hàng (KHÔNG để fail mail làm hỏng checkout)
    try {
      await sendOrderConfirmationMail({
        to: user.email,
        user,
        order,
        breakdown: {
          subtotal,
          tax,
          shippingFee,
          discountValue,
          usedPointsValue,
          totalBefore,
          total,
        },
      });
    } catch (mailErr) {
      console.error('Gửi email xác nhận đơn hàng lỗi:', mailErr);
    }

    // 10. Xóa giỏ hàng
    if (req.session.user && req.session.user._id) {
      await Cart.deleteOne({ user: req.session.user._id });
    }
    req.session.cart = { items: [], total: 0 };
    delete req.session.appliedDiscount;
    delete req.session.usedPoints;

    // 11. Redirect sang trang chi tiết đơn hàng (order-success hiển thị chi tiết)
    return res.redirect(`/order-success/${order._id}`);
  } catch (err) {
    console.error('Lỗi khi checkout:', err);
    return res.status(500).send('Lỗi server khi đặt hàng');
  }
}


/**
 * GET /order-success/:id
 */
async function viewOrderSuccess(req, res) {
  try {
    const order = await Order.findById(req.params.id).populate('user');
    if (!order) return res.status(404).send('Không tìm thấy đơn hàng');
    res.render('pages/order-success', { title: 'Đặt hàng thành công', order });
  } catch (err) {
    console.error(err);
    res.status(500).send('Lỗi server');
  }
}

/**
 * GET /my-orders
 */
async function viewMyOrders(req, res) {
  try {
    const orders = await Order.find({ user: req.session.user._id }).sort({
      createdAt: -1,
    });
    res.render('pages/orders', { title: 'Đơn hàng của tôi', orders });
  } catch (err) {
    console.error(err);
    res.status(500).send('Lỗi server');
  }
}

/**
 * GET /my-orders/:id
 */
async function viewMyOrderDetail(req, res) {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.session.user._id,
    });
    if (!order) return res.status(404).send('Không tìm thấy đơn hàng');
    res.render('pages/order-detail', { title: 'Chi tiết đơn hàng', order });
  } catch (err) {
    console.error(err);
    res.status(500).send('Lỗi server');
  }
}

/**
 * POST /checkout/apply-discount
 * Ajax áp mã giảm giá
 */
async function applyDiscount(req, res) {
  try {
    ensureCart(req);
    if (!req.session.cart.items.length) {
      return res.status(400).json({
        success: false,
        message: 'Giỏ hàng trống.',
      });
    }

    const { discountCode } = req.body;
    if (!discountCode) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mã giảm giá.',
      });
    }

    const code = discountCode.trim().toUpperCase();

    const discountDoc = await DiscountCode.findOne({ code });
    if (!discountDoc) {
      return res.status(400).json({
        success: false,
        message: 'Mã giảm giá không hợp lệ.',
      });
    }

    if (discountDoc.usageCount >= discountDoc.usageLimit) {
      return res.status(400).json({
        success: false,
        message: 'Mã giảm giá đã được sử dụng hết.',
      });
    }

    const cart = req.session.cart;
    const subtotal = cart.total || 0;

    let discountValue = discountDoc.discountValue || 0;
    if (discountValue > subtotal) discountValue = subtotal;

    const tax = Math.round(subtotal * 0.1); // VAT 10%
    const shippingFee = subtotal >= 2000000 ? 0 : 50000; // freeship từ 2tr
    const totalBefore = subtotal + tax + shippingFee;
    const grandTotal = Math.max(0, totalBefore - discountValue);

    req.session.appliedDiscount = {
      code,
      discountValue,
    };

    return res.json({
      success: true,
      discountValue,
      subtotal,
      tax,
      shippingFee,
      grandTotal,
    });
  } catch (err) {
    console.error('Lỗi applyDiscount:', err);
    return res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra, vui lòng thử lại.',
    });
  }
}

// XÓA 1 địa chỉ giao hàng theo index
async function deleteShippingAddress(req, res) {
  try {
    if (!req.session.user) return res.redirect('/login');

    const index = parseInt(req.params.index, 10);
    const user = await User.findById(req.session.user._id);

    if (!user || !Array.isArray(user.addresses) || !user.addresses[index]) {
      return res.redirect('/checkout');
    }

    user.addresses.splice(index, 1);

    if (user.addresses.length > 0 && !user.addresses.some(a => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    return res.redirect('/checkout');
  } catch (err) {
    console.error('Lỗi deleteShippingAddress:', err);
    return res.status(500).send('Lỗi server khi xoá địa chỉ');
  }
}

// CẬP NHẬT (SỬA) 1 địa chỉ giao hàng theo index
async function updateShippingAddress(req, res) {
  try {
    if (!req.session.user) return res.redirect('/login');

    const index = parseInt(req.params.index, 10);
    const user = await User.findById(req.session.user._id);

    if (!user || !Array.isArray(user.addresses) || !user.addresses[index]) {
      return res.redirect('/checkout');
    }

    const addr = user.addresses[index];
    const { fullName, phone, addressLine, ward, district, province, isDefault } = req.body;

    addr.fullName = fullName;
    addr.phone = phone;
    addr.addressLine = addressLine;
    addr.ward = ward;
    addr.district = district;
    addr.province = province;

    if (isDefault === 'on') {
      user.addresses.forEach((a, i) => {
        a.isDefault = i === index;
      });
    }

    await user.save();
    return res.redirect('/checkout');
  } catch (err) {
    console.error('Lỗi updateShippingAddress:', err);
    return res.status(500).send('Lỗi server khi sửa địa chỉ');
  }
}

// POST /checkout/address/add
async function createShippingAddress(req, res) {
  try {
    if (!req.session.user) return res.redirect('/login');

    const user = await User.findById(req.session.user._id);
    if (!user) return res.redirect('/checkout');

    if (!Array.isArray(user.addresses)) {
      user.addresses = [];
    }

    if (user.addresses.length >= 5) {
      return res.redirect('/checkout');
    }

    const { fullName, phone, addressLine, province, district, ward, isDefault } = req.body;

    if (!fullName || !addressLine || !province || !district || !ward) {
      return res.redirect('/checkout');
    }

    const newAddr = {
      fullName,
      phone: phone || '',
      addressLine,
      province,
      district,
      ward,
      isDefault: false,
    };

    if (isDefault === 'on' || user.addresses.length === 0) {
      user.addresses.forEach(a => (a.isDefault = false));
      newAddr.isDefault = true;
    }

    user.addresses.push(newAddr);
    await user.save();

    return res.redirect('/checkout');
  } catch (err) {
    console.error('Lỗi createShippingAddress:', err);
    return res.status(500).send('Lỗi server khi thêm địa chỉ');
  }
}

// GET /order-lookup
async function viewOrderLookup(req, res) {
  if (req.session.user && req.session.user._id) {
    return res.redirect('/my-orders');
  }

  res.render('pages/order-lookup', {
    title: 'Lịch sử giao dịch',
    orders: null,
    query: { phone: '', orderId: '' },
    error: null,
  });
}

// POST /order-lookup
async function handleOrderLookup(req, res) {
  try {
    const { phone, orderId } = req.body;
    const qPhone = (phone || '').trim();
    const qId = (orderId || '').trim();

    if (!qPhone) {
      return res.render('pages/order-lookup', {
        title: 'Lịch sử giao dịch',
        orders: [],
        query: { phone: qPhone, orderId: qId },
        error: 'Vui lòng nhập số điện thoại để tra cứu.',
      });
    }

    const filter = { phone: qPhone };
    if (qId) {
      filter._id = qId;
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(20);

    let error = null;
    if (!orders.length) {
      error = 'Không tìm thấy giao dịch nào với thông tin đã nhập.';
    }

    res.render('pages/order-lookup', {
      title: 'Lịch sử giao dịch',
      orders,
      query: { phone: qPhone, orderId: qId },
      error,
    });
  } catch (err) {
    console.error('Lỗi tra cứu đơn hàng:', err);
    res.render('pages/order-lookup', {
      title: 'Lịch sử giao dịch',
      orders: [],
      query: { phone: req.body.phone || '', orderId: req.body.orderId || '' },
      error: 'Có lỗi xảy ra, vui lòng thử lại sau.',
    });
  }
}

module.exports = {
  viewCheckout,
  postCheckout,
  viewOrderSuccess,
  viewMyOrders,
  viewMyOrderDetail,
  applyDiscount,
  deleteShippingAddress,
  updateShippingAddress,
  createShippingAddress,
  viewOrderLookup,
  handleOrderLookup,
};
