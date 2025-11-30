function ensureAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).send('Không có quyền truy cập. Vui lòng đăng nhập với tài khoản admin.');
}

function attachUser(req, res, next) {
  res.locals.currentUser = req.session ? req.session.user : null;
  next();
}

module.exports = {
  ensureAuth,
  ensureAdmin,
  attachUser,
};