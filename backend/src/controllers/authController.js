const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { sendMail } = require('../utils/mailer');

// ĐĂNG KÝ
async function getRegister(req, res) {
  res.render('auth/register', { title: 'Đăng ký', error: null });
}

async function postRegister(req, res) {
  try {
    const { fullName, email, password, address } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.render('auth/register', {
        title: 'Đăng ký',
        error: 'Email đã tồn tại.',
      });
    }

    const user = new User({ fullName, email, password, address });
    await user.save();

    req.session.user = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      loyaltyPoints: user.loyaltyPoints,
    };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('auth/register', {
      title: 'Đăng ký',
      error: 'Có lỗi xảy ra, vui lòng thử lại.',
    });
  }
}

// ========== ĐĂNG NHẬP ==========
async function getLogin(req, res) {
  res.render('auth/login', { title: 'Đăng nhập', error: null });
}

async function postLogin(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('auth/login', {
        title: 'Đăng nhập',
        error: 'Sai email hoặc mật khẩu.',
      });
    }
 
    if (!user.isActive) {
      return res.render('auth/login', {
        title: 'Đăng nhập',
        error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.',
      });
    }

    const ok = await user.comparePassword(password, user.password);
    if (!ok) {
      return res.render('auth/login', {
        title: 'Đăng nhập',
        error: 'Sai email hoặc mật khẩu.',
      });
    }

    req.session.user = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      loyaltyPoints: user.loyaltyPoints,
    };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('auth/login', {
      title: 'Đăng nhập',
      error: 'Có lỗi xảy ra, vui lòng thử lại.',
    });
  }
}

// ========== ĐĂNG XUẤT ==========
function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/');
  });
}

// ========== HỒ SƠ ==========
async function getProfile(req, res) {
  const user = await User.findById(req.session.user._id);
  res.render('pages/profile', {
    title: 'Hồ sơ cá nhân',
    user,
    message: null,
    error: null,
  });
}

async function postProfile(req, res) {
  try {
    const { fullName, address } = req.body;
    const user = await User.findById(req.session.user._id);
    user.fullName = fullName;
    user.address = address;
    await user.save();

    req.session.user.fullName = fullName;

    res.render('pages/profile', {
      title: 'Hồ sơ cá nhân',
      user,
      message: 'Cập nhật thành công.',
      error: null,
    });
  } catch (err) {
    console.error(err);
    const user = await User.findById(req.session.user._id);
    res.render('pages/profile', {
      title: 'Hồ sơ cá nhân',
      user,
      message: null,
      error: 'Có lỗi xảy ra.',
    });
  }
}

// ========== QUÊN MẬT KHẨU ==========
async function getForgotPassword(req, res) {
  res.render('auth/forgot-password', {
    title: 'Quên mật khẩu',
    error: null,
    message: null,
  });
}

async function postForgotPassword(req, res) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Không tiết lộ email có tồn tại hay không
    if (!user) {
      return res.render('auth/forgot-password', {
        title: 'Quên mật khẩu',
        error: null,
        message: 'Nếu email tồn tại trong hệ thống, mã đặt lại đã được gửi.',
      });
    }

    // Tạo mã 6 số
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 phút
    await user.save();

    await sendMail(
      user.email,
      'Mã đặt lại mật khẩu Máy Tính Store',
      `Mã xác nhận đặt lại mật khẩu của bạn là: ${code}\nMã có hiệu lực trong 15 phút.`
    );

    // Chuyển sang trang nhập OTP
    return res.redirect(`/new-password?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('Lỗi forgot password:', err);
    return res.render('auth/forgot-password', {
      title: 'Quên mật khẩu',
      error: 'Có lỗi xảy ra, vui lòng thử lại.',
      message: null,
    });
  }
}

// GET /new-password
async function getOtpPage(req, res) {
  res.render('auth/reset-otp', {
    title: 'Nhập mã xác nhận',
    error: null,
    message: null,
    email: req.query.email || '',
  });
}

// POST /new-password  (xử lý OTP)
async function postOtp(req, res) {
  try {
    let { email, code } = req.body;

    email = (email || '').trim();
    code  = (code  || '').trim();

    const user = await User.findOne({
      email,
      resetCode: code,
      resetCodeExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.render('auth/reset-otp', {
        title: 'Nhập mã xác nhận',
        error: 'Mã xác nhận không đúng hoặc đã hết hạn.',
        message: null,
        email,
      });
    }

    req.session.resetEmail = email;

    return res.redirect(`/reset-password?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('Lỗi verify OTP:', err);
    return res.render('auth/reset-otp', {
      title: 'Nhập mã xác nhận',
      error: 'Có lỗi xảy ra, vui lòng thử lại.',
      message: null,
      email: req.body.email || '',
    });
  }
}

// POST /new-password/resend  (gửi lại mã)
async function postResendOtp(req, res) {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.render('auth/reset-otp', {
        title: 'Nhập mã xác nhận',
        error: 'Email không tồn tại trong hệ thống.',
        message: null,
        email,
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendMail(
      user.email,
      'Mã đặt lại mật khẩu Máy Tính Store (gửi lại)',
      `Mã xác nhận đặt lại mật khẩu của bạn là: ${code}\nMã có hiệu lực trong 15 phút.`
    );

    return res.render('auth/reset-otp', {
      title: 'Nhập mã xác nhận',
      error: null,
      message: 'Mã xác nhận đã được gửi lại. Vui lòng kiểm tra email.',
      email,
    });
  } catch (err) {
    console.error('Lỗi resend OTP:', err);
    return res.render('auth/reset-otp', {
      title: 'Nhập mã xác nhận',
      error: 'Có lỗi xảy ra, vui lòng thử lại.',
      message: null,
      email: req.body.email || '',
    });
  }
}

// GET /reset-password
async function getResetPasswordPage(req, res) {
  if (!req.session.resetEmail) {
    return res.redirect('/forgot-password');
  }

  res.render('auth/reset-password', {
    title: 'Đặt mật khẩu mới',
    error: null,
    message: null,
  });
}

// POST /reset-password
// POST /reset-password
async function postResetPassword(req, res) {
  try {
    if (!req.session.resetEmail) {
      return res.redirect('/forgot-password');
    }

    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.render('auth/reset-password', {
        title: 'Đặt mật khẩu mới',
        error: 'Mật khẩu nhập lại không khớp.',
        message: null,
      });
    }

    // TÌM USER THEO EMAIL LƯU TRONG SESSION
    const email = req.session.resetEmail;
    const user = await User.findOne({ email });

    if (!user) {
      req.session.resetEmail = null;
      return res.redirect('/forgot-password');
    }

    // GÁN MẬT KHẨU MỚI
    user.password = password;

    // XÓA OTP ĐÃ DÙNG
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;

    await user.save(); 

    // XÓA resetEmail khỏi session
    req.session.resetEmail = null;

    return res.render('auth/login', {
      title: 'Đặt mật khẩu mới',
      error: null,
      message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    });
  } catch (err) {
    console.error('Lỗi đặt mật khẩu mới:', err);
    return res.render('auth/reset-password', {
      title: 'Đặt mật khẩu mới',
      error: 'Có lỗi xảy ra, vui lòng thử lại.',
      message: null,
    });
  }
}

// ========== ĐỔI MẬT KHẨU ==========

// GET /change-password
async function getChangePassword(req, res) {
  // nếu chưa đăng nhập thì đá ra login (tuỳ app bạn có middleware hay không)
  if (!req.session.user) {
    return res.redirect('/login');
  }

  res.render('auth/change-password', {
    title: 'Đổi mật khẩu',
    error: null,
    message: null,
  });
}

// POST /change-password
async function postChangePassword(req, res) {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.render('auth/change-password', {
        title: 'Đổi mật khẩu',
        error: 'Mật khẩu mới nhập lại không khớp.',
        message: null,
      });
    }

    const user = await User.findById(req.session.user._id);
    if (!user) {
      return res.redirect('/login');
    }

    // kiểm tra mật khẩu hiện tại
    const ok = await user.comparePassword(currentPassword);
    if (!ok) {
      return res.render('auth/change-password', {
        title: 'Đổi mật khẩu',
        error: 'Mật khẩu hiện tại không đúng.',
        message: null,
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.render('auth/change-password', {
      title: 'Đổi mật khẩu',
      error: null,
      message: 'Đổi mật khẩu thành công.',
    });
  } catch (err) {
    console.error('Lỗi đổi mật khẩu:', err);
    return res.render('auth/change-password', {
      title: 'Đổi mật khẩu',
      error: 'Có lỗi xảy ra, vui lòng thử lại.',
      message: null,
    });
  }
}

// ========== EXPORT ==========
module.exports = {
  getRegister,
  postRegister,
  getLogin,
  postLogin,
  logout,
  getProfile,
  postProfile,
  getForgotPassword,
  postForgotPassword,
  getOtpPage,
  postOtp,
  postResendOtp,
  getResetPasswordPage,
  postResetPassword,
  getChangePassword,
  postChangePassword,
};
