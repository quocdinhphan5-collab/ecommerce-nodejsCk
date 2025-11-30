const Product = require('../models/Product');
const Cart = require('../models/Cart');

function ensureSessionCart(req) {
  if (!req.session.cart) {
    req.session.cart = { items: [], total: 0 };
  }
}

function recalcSessionCart(cart) {
  cart.total = cart.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
}

// Lấy giỏ DB cho user đăng nhập
async function getOrCreateUserCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId, items: [], total: 0 });
  }
  return cart;
}

// POST /cart/add
async function addToCart(req, res) {
  try {
    const { productId, variantIndex, quantity } = req.body;
    const qty = Math.max(1, parseInt(quantity || '1', 10));

    const product = await Product.findById(productId);
    if (!product) {
      const isAjax =
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: 'Sản phẩm không tồn tại.',
        });
      }
      return res.redirect('back');
    }

    const vIndex = Number.isInteger(parseInt(variantIndex, 10))
      ? parseInt(variantIndex, 10)
      : null;

    const variant =
      vIndex != null && product.variants && product.variants[vIndex]
        ? product.variants[vIndex]
        : null;

    const price = variant ? variant.price : product.price;
    const variantName = variant ? variant.name : '';

    let totalQty = 0;

    // Nếu user đã đăng nhập → lưu DB
    if (req.session.user && req.session.user._id) {
      const userId = req.session.user._id;
      let cart = await getOrCreateUserCart(userId);

      const idx = cart.items.findIndex(
        (it) =>
          it.product.toString() === productId &&
          String(it.variantIndex ?? '') === String(vIndex ?? '')
      );

      if (idx >= 0) {
        cart.items[idx].quantity += qty;
      } else {
        cart.items.push({
          product: product._id,
          variantIndex: vIndex,
          name: product.name,
          variantName,
          price,
          quantity: qty,
        });
      }

      cart.recalcTotal();
      cart.updatedAt = new Date();
      await cart.save();

      req.session.cart = {
        items: cart.items.map((it) => ({
          productId: it.product.toString(),
          name: it.name,
          variantName: it.variantName,
          price: it.price,
          quantity: it.quantity,
        })),
        total: cart.total,
      };

      totalQty = cart.items.reduce((sum, it) => sum + it.quantity, 0);
    } else {
      // Guest → chỉ lưu session
      ensureSessionCart(req);
      const idx = req.session.cart.items.findIndex(
        (it) =>
          it.productId === productId &&
          String(it.variantIndex ?? '') === String(vIndex ?? '')
      );

      if (idx >= 0) {
        req.session.cart.items[idx].quantity += qty;
      } else {
        req.session.cart.items.push({
          productId,
          variantIndex: vIndex,
          name: product.name,
          variantName,
          price,
          quantity: qty,
        });
      }
      recalcSessionCart(req.session.cart);

      totalQty = req.session.cart.items.reduce(
        (sum, it) => sum + it.quantity,
        0
      );
    }

    const isAjax =
      req.xhr ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    if (isAjax) {
      return res.json({
        success: true,
        message: 'Đã thêm sản phẩm vào giỏ hàng',
        cartQty: totalQty,
      });
    }

    return res.redirect('back');
  } catch (err) {
    console.error('Lỗi thêm giỏ hàng:', err);

    const isAjax =
      req.xhr ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    if (isAjax) {
      return res.status(500).json({
        success: false,
        message: 'Có lỗi xảy ra, không thể thêm vào giỏ hàng.',
      });
    }

    return res.redirect('/cart');
  }
}

// GET /cart
async function viewCart(req, res) {
  try {
    // Nếu đã đăng nhập → ưu tiên lấy giỏ từ DB
    if (req.session.user && req.session.user._id) {
      const userId = req.session.user._id;
      let cart = await Cart.findOne({ user: userId });

      // Nếu trong session có giỏ nhưng DB chưa có, có thể merge lần đầu
      if (!cart) {
        cart = new Cart({ user: userId, items: [], total: 0 });
      }

      cart.recalcTotal();
      await cart.save();

      const viewCart = {
        items: cart.items.map((it) => ({
          productId: it.product.toString(),
          name: it.name,
          variantName: it.variantName,
          price: it.price,
          quantity: it.quantity,
        })),
        total: cart.total,
      };

      // đồng bộ vào session để view/JS dùng
      req.session.cart = viewCart;

      return res.render('pages/cart', {
        title: 'Giỏ hàng',
        cart: viewCart,
      });
    }

    // Chưa đăng nhập → dùng session
    ensureSessionCart(req);
    return res.render('pages/cart', {
      title: 'Giỏ hàng',
      cart: req.session.cart,
    });
  } catch (err) {
    console.error('Lỗi viewCart:', err);
    return res.render('pages/cart', {
      title: 'Giỏ hàng',
      cart: { items: [], total: 0 },
    });
  }
}

// POST /cart/update
async function updateCart(req, res) {
  try {
    const { quantities } = req.body;

    // User đăng nhập → cập nhật giỏ trong DB
    if (req.session.user && req.session.user._id) {
      const userId = req.session.user._id;
      let cart = await Cart.findOne({ user: userId });
      if (!cart) {
        return res.redirect('/cart');
      }

      if (quantities) {
        cart.items.forEach((it, idx) => {
          const q = Math.max(0, parseInt(quantities[idx] || '0', 10));
          if (q === 0) {
            it._remove = true;
          } else {
            it.quantity = q;
          }
        });
        cart.items = cart.items.filter((it) => !it._remove);
      }

      cart.recalcTotal();
      cart.updatedAt = new Date();
      await cart.save();

      // đồng bộ lại session
      req.session.cart = {
        items: cart.items.map((it) => ({
          productId: it.product.toString(),
          name: it.name,
          variantName: it.variantName,
          price: it.price,
          quantity: it.quantity,
        })),
        total: cart.total,
      };

      return res.redirect('/cart');
    }

    // Guest → cập nhật session
    ensureSessionCart(req);
    if (quantities) {
      Object.keys(quantities).forEach((idx) => {
        const q = Math.max(0, parseInt(quantities[idx] || '0', 10));
        if (req.session.cart.items[idx]) {
          if (q === 0) {
            req.session.cart.items[idx]._remove = true;
          } else {
            req.session.cart.items[idx].quantity = q;
          }
        }
      });
      req.session.cart.items = req.session.cart.items.filter(
        (it) => !it._remove
      );
      recalcSessionCart(req.session.cart);
    }
    return res.redirect('/cart');
  } catch (err) {
    console.error('Lỗi updateCart:', err);
    return res.redirect('/cart');
  }
}

module.exports = {
  addToCart,
  viewCart,
  updateCart,
};
