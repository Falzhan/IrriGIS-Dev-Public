//middleware/auth.js
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Authentication required');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    
    if (!user) throw new Error('User not found');
    if (!user.is_active) throw new Error('Account deactivated');
    if (decoded.sessionToken && user.session_token !== decoded.sessionToken) {
      throw new Error('Session expired - logged in from another device');
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    const isSessionExpired = error.message === 'Session expired - logged in from another device';
    res.status(401).json({
      success: false,
      message: error.message || 'Authentication failed',
      sessionExpired: isSessionExpired
    });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Insufficient privileges'
    });
  }
  next();
};

module.exports = { authenticate, authorize };
