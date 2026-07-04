function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: '请先登录' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userRole === 'admin') {
    return next();
  }
  res.status(403).json({ error: '需要管理员权限' });
}

module.exports = { requireAuth, requireAdmin };
