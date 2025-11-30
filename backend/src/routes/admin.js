const express = require('express');
const router = express.Router();
const { ensureAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// tất cả route bên dưới đều yêu cầu admin
router.use(ensureAdmin);

// Dashboard
router.get('/', (req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', adminController.dashboard);

// Sản phẩm
router.get('/products', adminController.listProducts);
router.get('/products/new', adminController.getProductForm);
router.get('/products/:id/edit', adminController.getProductForm);
router.post('/products/save', adminController.postProduct);
router.post('/products/:id/delete', adminController.deleteProduct);

// Đơn hàng
router.get('/orders', adminController.listOrders);
router.get('/orders/:id', adminController.viewOrderDetail);
router.post('/orders/:id/status', adminController.updateOrderStatus);

// Mã giảm giá
router.get('/discounts', adminController.listDiscounts);
router.post('/discounts', adminController.postDiscount);

// Người dùng
router.get('/users', adminController.listUsers);
router.get('/users/:id/edit', adminController.getUserEditForm);
router.post('/users/:id/update', adminController.updateUser);
router.post('/users/:id/toggle-active', adminController.toggleUserActive);

module.exports = router;