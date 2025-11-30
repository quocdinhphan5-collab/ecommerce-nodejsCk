const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const orderController = require('../controllers/orderController');

router.get('/checkout', orderController.viewCheckout);
router.post('/checkout', orderController.postCheckout);
router.post('/checkout/apply-discount', orderController.applyDiscount); 
router.get('/order-success/:id', orderController.viewOrderSuccess);
router.get('/my-orders', ensureAuth, orderController.viewMyOrders);
router.get('/my-orders/:id', ensureAuth, orderController.viewMyOrderDetail);

module.exports = router;