const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { ensureAuth } = require('../middleware/auth');

// Đăng ký
router.get('/register', authController.getRegister);
router.post('/register', authController.postRegister);

// Đăng nhập
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);

router.get('/logout', authController.logout);

router.get('/profile', ensureAuth, authController.getProfile);
router.post('/profile', ensureAuth, authController.postProfile);

// Quên mật khẩu
router.get('/forgot-password', authController.getForgotPassword);
router.post('/forgot-password', authController.postForgotPassword);

router.get('/new-password', authController.getOtpPage);
router.post('/new-password', authController.postOtp);
router.post('/new-password/resend', authController.postResendOtp);

router.get('/reset-password', authController.getResetPasswordPage);
router.post('/reset-password', authController.postResetPassword);

// Đổi mật khẩu
router.get('/change-password', authController.getChangePassword);
router.post('/change-password', authController.postChangePassword);

module.exports = router;