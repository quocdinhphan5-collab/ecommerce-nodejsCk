const Order = require('../models/Order');
const DiscountCode = require('../models/DiscountCode');
const User = require('../models/User');
const Cart = require('../models/Cart');

function ensureCart(req) {
  if (!req.session.cart) {
    req.session.cart = { items: [], total: 0 };
  }
}

async function viewCheckout(req, res) {
  try {
    ensureCart(req);
    if (!req.session.cart.items.length) {
      return res.redirect('/cart');
    }

    let user = null;
    if (req.session.user) {
      // Lấy user đầy đủ từ DB để có addresses, loyaltyPoints,...
      user = await User.findById(req.session.user._id);
      if (user && !Array.isArray(user.addresses)) {
        user.addresses = [];
      }
    }

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

async function postCheckout(req, res) {
  ensureCart(req);
  if (!req.session.cart.items.length) {
    return res.redirect('/cart');
  }

  try {
    const { fullName, email, address, discountCode, usePoints, savedAddressId } = req.body;
    let user = null;

    // 1. Lấy user nếu đã đăng nhập
    if (req.session.user) {
      user = await User.findById(req.session.user._id);
      if (!user) {
        req.session.user = null;
      }
    }

    // 2. Nếu chưa có user -> tạo mới theo email
    if (!user) {
      user = await User.findOne({ email });
      if (!user) {
        const randomPass = Math.random().toString(36).slice(-8);
        user = new User({
          fullName,
          email,
          password: randomPass,
          address,
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
      // cập nhật lại tên / địa chỉ cho user
      user.fullName = fullName;
      if (address && address.trim()) {
        user.address = address.trim();
      }
      await user.save();
      req.session.user.fullName = fullName;
    }

    if (!Array.isArray(user.addresses)) {
      user.addresses = [];
    }

    // 3. Xác định shippingAddress
    let shippingAddress = address && address.trim ? address.trim() : '';

    if (!shippingAddress && savedAddressId && user.addresses.length > 0) {
      const selected = user.addresses.id(savedAddressId);
      if (selected) {
        shippingAddress =
          `${selected.fullName} - ${selected.phone} - ` +
          `${selected.street}, ${selected.ward}, ${selected.district}, ${selected.province}`;
      }
    }

    if (!shippingAddress) {
      shippingAddress = user.address || '';
    }

    if (!shippingAddress.trim()) {
      return res.status(400).send('Thiếu địa chỉ giao hàng');
    }

    // 4. Mã giảm giá
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

    // 5. Điểm thưởng: 1 điểm = 1.000 VND
    const cart = req.session.cart;
    const subtotal = cart.total || 0;                
    const tax = Math.round(subtotal * 0.1);          
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
      shippingAddress,
      items: cart.items.map((it) => ({
        product: it.productId,
        name: it.name,
        variantName: it.variantName,
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

    if (discountDoc && discountValue > 0) {
      discountDoc.usageCount += 1;
      await discountDoc.save();
    }

    // 7. Cập nhật điểm thưởng:
    // chương trình: KH được tích 10% giá trị đơn hàng dưới dạng điểm,
    // 1 điểm = 1000 VND -> subtotal * 10% / 1000
    const earnPoints = Math.floor((subtotal * 0.1) / 1000);

    user.loyaltyPoints = Math.max(0, user.loyaltyPoints - usedPoints + earnPoints);
    await user.save();
    req.session.user.loyaltyPoints = user.loyaltyPoints;

    // 8. Xóa giỏ hàng
    if (req.session.user && req.session.user._id) {
      await Cart.deleteOne({ user: req.session.user._id });
    }
    req.session.cart = { items: [], total: 0 };
    delete req.session.appliedDiscount;
    delete req.session.usedPoints;

    return res.redirect(`/order-success/${order._id}`);
  } catch (err) {
    console.error('Lỗi khi checkout:', err);
    return res.status(500).send('Lỗi server khi đặt hàng');
  }
}


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

async function viewMyOrders(req, res) {
  try {
    const orders = await Order.find({ user: req.session.user._id }).sort({ createdAt: -1 });
    res.render('pages/orders', { title: 'Đơn hàng của tôi', orders });
  } catch (err) {
    console.error(err);
    res.status(500).send('Lỗi server');
  }
}

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

    const tax = Math.round(subtotal * 0.1);             
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

module.exports = {
  viewCheckout,
  postCheckout,
  viewOrderSuccess,
  viewMyOrders,
  viewMyOrderDetail,
  applyDiscount,
};