const jwt = require('jsonwebtoken');
const supabase = require('../config/db');

// ─── Protect: verify JWT and attach user to request ──────────────────────────
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user profile from Supabase
      const { data: user, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, name, email, role, contact_number, address, is_active, is_verified')
        .eq('id', decoded.id)
        .maybeSingle();

      if (error || !user) {
        return res.status(401).json({ message: 'Not authorized. User no longer exists.' });
      }

      // Reject deactivated accounts even if token is still valid
      if (!user.is_active) {
        return res.status(403).json({ message: 'Account is deactivated. Please contact support.' });
      }

      // Map database schema to camelCase properties for application compatibility
      req.user = {
        _id: user.id,
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        name: user.name,
        email: user.email,
        role: user.role,
        contactNumber: user.contact_number,
        address: user.address,
        isActive: user.is_active,
        isVerified: user.is_verified
      };

      return next();
    } catch (error) {
      // Distinguish between expired and invalid tokens
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ message: 'Not authorized. Invalid token.' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized. No token provided.' });
  }
};

// ─── Authorize: role-based access control ────────────────────────────────────
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
