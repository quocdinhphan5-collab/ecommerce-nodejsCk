const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

router.get('/cart', cartController.viewCart);
router.post('/cart/add', cartController.addToCart);
router.post('/cart/update', cartController.updateCart);

module.exports = router;