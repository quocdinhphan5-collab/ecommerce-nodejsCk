const Product = require('../models/Product');
const Order = require('../models/Order');
const DiscountCode = require('../models/DiscountCode');
const User = require('../models/User');
const Category = require('../models/Category');

// DASHBOARD
async function dashboard(req, res) {
  try {
    const totalUsers = await User.countDocuments();
    const newUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) }
    });

    const orders = await Order.find({});
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // Top sản phẩm bán chạy
    const topProducts = await Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          quantity: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
        }
      },
      { $sort: { quantity: -1 } },
      { $limit: 5 }
    ]);

    // Chart doanh thu
    const chartLabels = orders.map(o => o.createdAt.toLocaleDateString());
    const revenueSeries = orders.map(o => o.totalAmount);
    const orderSeries = orders.map(() => 1);

    res.render("admin/dashboard", {
      stats: {
        title: "Bảng điều khiển",
        totalUsers,
        newUsers,
        totalOrders,
        totalRevenue
      },
      topProducts,
      chartData: {
        labels: chartLabels,
        revenueSeries,
        orderSeries
      },
      range: req.query.range || "month",
      start: req.query.from || "",
      end: req.query.to || ""
    });

  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Lỗi server");
  }
}

// QUẢN LÝ SẢN PHẨM
async function listProducts(req, res) {
  try {
    const { q, category } = req.query || {};

    const filter = {};

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [{ name: regex }, { description: regex }];
    }

    if (category && category.trim()) {
      filter.category = category.trim();
    }

    const [products, categories] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }),
      Category.find({ isActive: true }).sort({ name: 1 }),
    ]);

    return res.render('admin/products', {
      title: 'Quản lý sản phẩm',
      products,
      categories,
      query: {
        q: q || '',
        category: category || '',
      },
    });
  } catch (err) {
    console.error('Lỗi listProducts:', err);
    return res.status(500).send('Lỗi server: ' + err.message);
  }
}

async function getProductForm(req, res) {
  try {
    const { id } = req.params;
    let product = null;
    if (id) {
      product = await Product.findById(id);
    }

    const categories = await Category.find({ isActive: true }).sort({ name: 1 });

    res.render('admin/product-form', {
      title: product ? 'Sửa sản phẩm' : 'Thêm sản phẩm',
      product,
      categories,
    });
  } catch (err) {
    console.error('Lỗi getProductForm:', err);
    return res.status(500).send('Lỗi server: ' + err.message);
  }
}

async function postProduct(req, res) {
  try {
    const { id, name, brand, category, price, description } = req.body;

    const images = (req.body.images || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    // Parse biến thể từ form: variants[index][name|price|stock]
    let variants = [];
    if (req.body.variants) {
      const raw = req.body.variants; // là object
      variants = Object.values(raw)
        .filter((v) => v.name && v.name.trim())
        .map((v) => ({
          name: v.name.trim(),
          price: Number(v.price) || 0,
          stock: Number(v.stock) || 0,
        }));
    }

    // ✅ Kiểm tra mô tả: ít nhất 5 dòng có nội dung
    const desc = (description || '').trim();
    const lineCount = desc
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '').length;

    if (lineCount < 5) {
      const categories = await Category.find({ isActive: true }).sort({
        name: 1,
      });

      // Dựng lại object product để fill form
      const productObj = {
        _id: id,
        name,
        brand,
        category,
        price: Number(price) || 0,
        description,
        images,
        variants,
        isNew: !!req.body.isNew,
        isBestSeller: !!req.body.isBestSeller,
      };

      return res.status(400).render('admin/product-form', {
        title: id ? 'Sửa sản phẩm' : 'Thêm sản phẩm',
        product: productObj,
        categories,
        error: 'Mô tả sản phẩm phải có ít nhất 5 dòng nội dung.',
      });
    }

    const data = {
      name,
      brand,
      category, // slug
      price: Number(price) || 0,
      description,
      images,
      variants,
      isNew: !!req.body.isNew,
      isBestSeller: !!req.body.isBestSeller,
    };

    if (id) {
      await Product.findByIdAndUpdate(id, data);
    } else {
      await Product.create(data);
    }

    return res.redirect('/admin/products');
  } catch (err) {
    console.error('Lỗi postProduct:', err);
    return res.status(500).send('Lỗi server: ' + err.message);
  }
}

async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    if (id) {
      await Product.findByIdAndDelete(id);
    }
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Lỗi deleteProduct:', err);
    res.status(500).send('Lỗi server');
  }
}

// QUẢN LÝ ĐƠN HÀNG
async function listOrders(req, res) {
  try {
    const perPage = 20;
    const page = Math.max(parseInt(req.query.page) || 1, 1);

    const {
      status = 'all',
      range = 'all',
      from,
      to,
    } = req.query;

    const filter = {};
    const now = new Date();
    let startDate = null;
    let endDate = null;

    if (status !== 'all') {
      filter.status = status;
    }

    if (from && to) {
      startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
    } 
    
    else if (range === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } 
    
    else if (range === 'yesterday') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    
    else if (range === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 7);
    }
    
    else if (range === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    if (startDate && endDate) {
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const totalCount = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .populate('user');

    const totalPages = Math.max(Math.ceil(totalCount / perPage), 1);

    res.render('admin/orders', {
      title: 'Quản lý đơn hàng',
      orders,
      status,
      range,
      from: from || '',
      to: to || '',
      currentPage: page,
      totalPages,
      totalCount,
      perPage,
    });

  } catch (err) {
    console.error('Lỗi listOrders:', err);
    res.status(500).send('Lỗi server');
  }
}

async function viewOrderDetail(req, res) {
  try {
    const order = await Order.findById(req.params.id).populate('user');
    if (!order) return res.status(404).send('Không tìm thấy đơn hàng');

    // view cho admin
    res.render('admin/order-detail', {
      title: 'Chi tiết đơn hàng',
      order,
    });
  } catch (err) {
    console.error('Lỗi viewOrderDetail:', err);
    res.status(500).send('Lỗi server');
  }
}

async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).send('Không tìm thấy đơn hàng');

    order.status = status || order.status;
    order.history.push({
      status: order.status,
      updatedAt: new Date(),
    });

    await order.save();
    res.redirect(`/admin/orders/${order._id}`);
  } catch (err) {
    console.error('Lỗi updateOrderStatus:', err);
    res.status(500).send('Lỗi server');
  }
}

// MÃ GIẢM GIÁ
async function listDiscounts(req, res) {
  try {
    const discounts = await DiscountCode.find({}).sort({ createdAt: -1 });
    res.render('admin/discounts', {
      title: 'Mã giảm giá',
      discounts,
    });
  } catch (err) {
    console.error('Lỗi listDiscounts:', err);
    res.status(500).send('Lỗi server');
  }
}

async function postDiscount(req, res) {
  try {
    const { code, discountValue, usageLimit } = req.body;
    const normalizedCode = (code || '').trim().toUpperCase();

    let discount = await DiscountCode.findOne({ code: normalizedCode });
    if (!discount) {
      discount = new DiscountCode({
        code: normalizedCode,
        discountValue: Number(discountValue) || 0,
        usageLimit: Number(usageLimit) || 1,
        usageCount: 0,
      });
    } else {
      discount.discountValue = Number(discountValue) || 0;
      discount.usageLimit = Number(usageLimit) || 1;
    }

    await discount.save();
    res.redirect('/admin/discounts');
  } catch (err) {
    console.error('Lỗi postDiscount:', err);
    res.status(500).send('Lỗi server');
  }
}

// QUẢN LÝ NGƯỜI DÙNG
async function listUsers(req, res) {
  try {
    const { q, role, status } = req.query;
    const filter = {};

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [{ fullName: regex }, { email: regex }];
    }
    if (role && role !== 'all') {
      filter.role = role;
    }
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'blocked') {
      filter.isActive = false;
    }

    const users = await User.find(filter).sort({ createdAt: -1 });

    res.render('admin/users', {
      title: 'Quản lý người dùng',
      users,
      query: {
        q: q || '',
        role: role || 'all',
        status: status || 'all',
      },
    });
  } catch (err) {
    console.error('Lỗi listUsers:', err);
    res.status(500).send('Lỗi server');
  }
}

// Form sửa thông tin người dùng
async function getUserEditForm(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).send('Không tìm thấy người dùng');
    }

    res.render('admin/user-edit', {
      title: 'Cập nhật người dùng',
      user,
    });
  } catch (err) {
    console.error('Lỗi getUserEditForm:', err);
    res.status(500).send('Lỗi server');
  }
}

// Cập nhật thông tin người dùng
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { fullName, email, address, role, isActive } = req.body;

    const update = {
      fullName: (fullName || '').trim(),
      email: (email || '').trim(),
      address: (address || '').trim(),
    };

    // Chỉ cho phép role là 'user' hoặc 'admin'
    if (['user', 'admin'].includes(role)) {
      update.role = role;
    }

    // checkbox isActive
    update.isActive = isActive === 'on';

    await User.findByIdAndUpdate(id, update);

    res.redirect('/admin/users');
  } catch (err) {
    console.error('Lỗi updateUser:', err);
    res.status(500).send('Lỗi server');
  }
}

async function toggleUserActive(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.redirect('back');

    user.isActive = !user.isActive;
    await user.save();

    res.redirect('back');
  } catch (err) {
    console.error('Lỗi toggleUserActive:', err);
    res.status(500).send('Lỗi server');
  }
}

module.exports = {
  dashboard,
  listProducts,
  getProductForm,
  postProduct,
  deleteProduct,
  listOrders,
  viewOrderDetail,
  updateOrderStatus,
  listDiscounts,
  postDiscount,
  listUsers,
  getUserEditForm,
  updateUser,
  toggleUserActive,
};
