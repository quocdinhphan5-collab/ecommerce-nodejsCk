const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const orderController = require('../controllers/orderController');

router.get('/', productController.getHome);
router.get('/order-lookup', orderController.viewOrderLookup);
router.post('/order-lookup', orderController.handleOrderLookup);

module.exports = router;