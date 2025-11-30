const Product = require('../models/Product');

async function getHome(req, res) {
  try {
    const latest = await Product.find({ isActive: true }).sort({ createdAt: -1 }).limit(8);
    const laptops = await Product.find({ category: 'laptop', isActive: true }).limit(4);
    const monitors = await Product.find({ category: 'monitor', isActive: true }).limit(4);
    const hdds = await Product.find({ category: 'hdd', isActive: true }).limit(4);
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

async function listProducts(req, res) {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = 12;
    const skip = (page - 1) * limit;

    const filter = { isActive: true };

    if (req.query.special === 'new') {
      filter.isNew = true;
    }
    if (req.query.special === 'best') {
      filter.isBestSeller = true;
    }

    if (req.query.category) filter.category = req.query.category;
    if (req.query.brand) filter.brand = req.query.brand;

    if (req.query.price_min || req.query.price_max) {
      filter.price = {};
      if (req.query.price_min) filter.price.$gte = Number(req.query.price_min);
      if (req.query.price_max) filter.price.$lte = Number(req.query.price_max);
    }

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


async function getProductDetail(req, res) {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).send('Không tìm thấy sản phẩm');

  res.render('pages/product-detail', {
    title: product.name,
    product,
    currentUser: req.session.user || null,
  });
}

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