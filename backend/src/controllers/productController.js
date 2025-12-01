const Product = require('../models/Product');
const mongoose = require('mongoose');

// TRANG CHỦ
async function getHome(req, res) {
  try {
    // Không lọc isActive nữa, lấy tất cả sản phẩm
    const latest = await Product.find({})
      .sort({ createdAt: -1 })
      .limit(8);

    const laptops = await Product.find({ category: 'laptop' }).limit(4);
    const monitors = await Product.find({ category: 'monitor' }).limit(4);
    const hdds = await Product.find({ category: 'hdd' }).limit(4);

    res.render('pages/home', {
      title: 'Cửa hàng máy tính',
      latest,
      laptops,
      monitors,
      hdds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Lỗi server');
  }
}

// DANH SÁCH SẢN PHẨM /products
async function listProducts(req, res) {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = 12;
    const skip = (page - 1) * limit;

    // BỎ isActive: true, cho hiện toàn bộ
    const filter = {};

    // lọc theo loại đặc biệt
    if (req.query.special === 'new') {
      filter.isNew = true;
    }
    if (req.query.special === 'best') {
      filter.isBestSeller = true;
    }

    // lọc theo danh mục, thương hiệu
    if (req.query.category) filter.category = req.query.category;
    if (req.query.brand) filter.brand = req.query.brand;

    // lọc theo giá
    if (req.query.price_min || req.query.price_max) {
      filter.price = {};
      if (req.query.price_min) filter.price.$gte = Number(req.query.price_min);
      if (req.query.price_max) filter.price.$lte = Number(req.query.price_max);
    }

    // tìm theo tên
    if (req.query.q) {
      filter.name = { $regex: req.query.q, $options: 'i' };
    }

    // SORT
    let sort = { createdAt: -1 };
    const sortParam = req.query.sort;

    if (sortParam === 'name_asc')   sort = { name: 1 };
    if (sortParam === 'name_desc')  sort = { name: -1 };
    if (sortParam === 'price_asc')  sort = { price: 1 };
    if (sortParam === 'price_desc') sort = { price: -1 };

    if (sortParam === 'rating_asc')  sort = { averageRating: 1 };
    if (sortParam === 'rating_desc') sort = { averageRating: -1 };

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.render('pages/product-list', {
      title: 'Sản phẩm',
      items,
      currentPage: page,
      totalPages,
      query: req.query,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Lỗi server');
  }
}

// CHI TIẾT SẢN PHẨM
async function getProductDetail(req, res) {
  try {
    const { id } = req.params;

    // Nếu id không phải ObjectId hợp lệ → trả 404, không query DB
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).send('Không tìm thấy sản phẩm');
      // hoặc: return res.render('pages/404');
    }

    const product = await Product.findById(id).lean();
    if (!product) {
      return res.status(404).send('Không tìm thấy sản phẩm');
    }

    return res.render('pages/product-detail', {
      title: product.name,
      product,
      currentUser: req.session.user || null,
    });
  } catch (err) {
    console.error('Lỗi getProductDetail:', err);
    return res.status(500).send('Lỗi server');
  }
}

// GỬI REVIEW
async function postReview(req, res) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).send('Không tìm thấy sản phẩm');

    const { name, comment, rating } = req.body;

    let reviewRating = null;

    if (rating && req.session.user) {
      reviewRating = Number(rating);
    }

    product.reviews.push({
      user: req.session.user ? req.session.user._id : undefined,
      name: name || (req.session.user && req.session.user.fullName) || 'Khách',
      comment,
      rating: reviewRating,
    });

    const ratings = product.reviews.filter(r => r.rating);
    if (ratings.length > 0) {
      const sum = ratings.reduce((s, r) => s + r.rating, 0);
      product.averageRating = sum / ratings.length;
      product.numRatings = ratings.length;
    }

    await product.save();

    const io = req.app.get('io');
    if (io) {
      io.to(product._id.toString()).emit('new-review', {
        name: name || 'Khách',
        comment,
        rating: reviewRating,
        createdAt: new Date(),
      });
      io.to(product._id.toString()).emit('rating-updated', {
        averageRating: product.averageRating,
        numRatings: product.numRatings,
      });
    }

    res.redirect(`/product/${product._id}`);
  } catch (err) {
    console.error('Lỗi review:', err);
    res.redirect(`/product/${req.params.id}`);
  }
}

module.exports = {
  getHome,
  listProducts,
  getProductDetail,
  postReview,
};
