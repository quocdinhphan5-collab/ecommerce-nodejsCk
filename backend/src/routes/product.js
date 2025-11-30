const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

router.get('/products', productController.listProducts);
router.get('/product/:id', productController.getProductDetail);
router.post('/product/:id/reviews', productController.postReview); 

module.exports = router;