const isSuperAdmin = (req, res, next) => {
  try {
    // Check if user exists in request (set by previous auth middleware)
    console.log("SuperAdmin", req.user);
    console.log("SuperAdmin", req.user.role);
    console.log("SuperAdmin", req.user.role !== 'superuser');
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: 'Authentication required'
      });
    }

    // Check if user is a superadmin
    if (req.user.role !== 'superuser') {
      return res.status(403).json({
        status: false,
        message: 'Access denied. SuperAdmin privileges required.'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Error checking admin privileges',
      error: error.message
    });
  }
};

module.exports = { isSuperAdmin }; 