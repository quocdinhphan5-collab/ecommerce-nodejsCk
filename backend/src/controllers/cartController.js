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
// POST /cart/add
async function addToCart(req, res) {
  try {
    const { productId, variantIndex, quantity } = req.body;

    // LOG: xem client gửi gì lên
    console.log('=== ADD TO CART BODY ===');
    console.log('productId:', productId);
    console.log('variantIndex (raw):', variantIndex);
    console.log('quantity:', quantity);

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

    // ===== XỬ LÝ variantIndex: mặc định 0 nếu có biến thể mà client không gửi =====
    let vIndex = null;

    if (typeof variantIndex === 'string' && variantIndex !== '') {
      const parsed = Number(variantIndex);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        vIndex = parsed;
      }
    } else {
      // Không gửi variantIndex nhưng sản phẩm có variants → chọn biến thể đầu tiên
      if (product.variants && product.variants.length > 0) {
        vIndex = 0;
      }
    }

    const variant =
      vIndex != null && product.variants && product.variants[vIndex]
        ? product.variants[vIndex]
        : null;

    console.log('Resolved vIndex:', vIndex);
    console.log('Resolved variant:', variant ? variant.name : null);

    const price = variant ? variant.price : product.price;
    const variantName = variant ? variant.name : '';

    // ====== KIỂM TRA TỒN KHO THEO BIẾN THỂ ======
    let availableStock = null;
    if (variant) {
      availableStock = Number.isFinite(variant.stock)
        ? Number(variant.stock)
        : 0;
    }

    let totalQtyInCart = 0; // số lượng hiện đang có trong giỏ cho sản phẩm + biến thể này

    // Nếu user đã đăng nhập → giỏ DB
    if (req.session.user && req.session.user._id) {
      const userId = req.session.user._id;
      let cart = await getOrCreateUserCart(userId);

      // Tính tổng số lượng hiện có trong giỏ cho cùng product + variantIndex
      cart.items.forEach((it) => {
        if (
          it.product.toString() === productId &&
          String(it.variantIndex ?? '') === String(vIndex ?? '')
        ) {
          totalQtyInCart += it.quantity;
        }
      });

      // Nếu có khai báo tồn kho cho biến thể → kiểm tra
      if (variant && availableStock !== null) {
        if (totalQtyInCart + qty > availableStock) {
          const isAjax =
            req.xhr ||
            (req.headers.accept &&
              req.headers.accept.includes('application/json'));

          const remain = Math.max(availableStock - totalQtyInCart, 0);

          const message =
            remain > 0
              ? `Chỉ còn ${remain} sản phẩm cho biến thể này.`
              : 'Biến thể này đã hết hàng.';

          if (isAjax) {
            return res.status(400).json({
              success: false,
              message,
            });
          }
          return res.redirect('back');
        }
      }

      // Qua được check kho → cập nhật giỏ
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

      // đồng bộ session
      req.session.cart = {
        items: cart.items.map((it) => ({
          productId: it.product.toString(),
          variantIndex: it.variantIndex,
          name: it.name,
          variantName: it.variantName,
          price: it.price,
          quantity: it.quantity,
        })),
        total: cart.total,
      };

      const totalQty = cart.items.reduce((sum, it) => sum + it.quantity, 0);

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
    }

    // ====== GUEST → GIỎ TRONG SESSION ======
    ensureSessionCart(req);

    // Tính tổng số lượng hiện có trong giỏ cho biến thể này (session)
    req.session.cart.items.forEach((it) => {
      if (
        it.productId === productId &&
        String(it.variantIndex ?? '') === String(vIndex ?? '')
      ) {
        totalQtyInCart += it.quantity;
      }
    });

    if (variant && availableStock !== null) {
      if (totalQtyInCart + qty > availableStock) {
        const isAjax =
          req.xhr ||
          (req.headers.accept && req.headers.accept.includes('application/json'));

        const remain = Math.max(availableStock - totalQtyInCart, 0);

        const message =
          remain > 0
            ? `Chỉ còn ${remain} sản phẩm cho biến thể này.`
            : 'Biến thể này đã hết hàng.';

        if (isAjax) {
          return res.status(400).json({
            success: false,
            message,
          });
        }
        return res.redirect('back');
      }
    }

    // Qua được check kho → cập nhật giỏ session
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

    const totalQty = req.session.cart.items.reduce(
      (sum, it) => sum + it.quantity,
      0
    );

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

      if (!cart) {
        cart = new Cart({ user: userId, items: [], total: 0 });
      }

      cart.recalcTotal();
      await cart.save();

      const viewCart = {
        items: cart.items.map((it) => ({
          productId: it.product.toString(),
          variantIndex: it.variantIndex,
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
          variantIndex: it.variantIndex,
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