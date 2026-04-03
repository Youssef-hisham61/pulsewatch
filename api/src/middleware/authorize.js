/**
 * authorize(...roles) — returns middleware that allows only the listed roles.
 * Requires authenticate() to have run first so req.user is populated.
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = authorize;
