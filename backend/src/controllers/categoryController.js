const Category = require('../models/Category');

function slugify(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')    
    .replace(/^-+|-+$/g, '');
}

async function listCategories(req, res) {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.render('admin/categories', {
      title: 'Quản lý danh mục',
      categories,
    });
  } catch (err) {
    console.error('Lỗi listCategories:', err);
    res.status(500).send('Lỗi server');
  }
}

async function createCategory(req, res) {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.redirect('/admin/categories');
    }

    const slug = slugify(name);

    await Category.findOneAndUpdate(
      { slug },
      { name: name.trim(), slug },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Lỗi createCategory:', err);
    res.status(500).send('Lỗi server');
  }
}

async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    if (id) {
      await Category.findByIdAndDelete(id);
    }
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Lỗi deleteCategory:', err);
    res.status(500).send('Lỗi server');
  }
}

module.exports = {
  listCategories,
  createCategory,
  deleteCategory,
};
