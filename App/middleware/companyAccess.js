const ensureCompanyAccess = (model) => {
    return async (req, res, next) => {
        try {
            // Validate user exists and has company information
            if (!req.user) {
                return res.status(401).json({
                    status: false,
                    message: 'Authentication required'
                });
            }

            // Get company ID from user (prefer company_id over company)
            const userCompanyId = req.user.company_id || req.user.company?.id;
            
            if (!userCompanyId) {
                console.error('Company access middleware: User missing company information', {
                    userId: req.user.id,
                    userRole: req.user.role
                });
                return res.status(403).json({
                    status: false,
                    message: 'Access denied: User company information missing'
                });
            }

            // Superusers can access any company data
            if (req.user.role === 'superuser') {
                return next();
            }
            
            // For non-superusers, enforce company access restrictions
            // Add company filter to query parameters for GET requests
            if (req.method === 'GET') {
                if (!req.query) {
                    req.query = {};
                }
                
                if (!req.query.where) {
                    req.query.where = {};
                }
                
                // Use company_id for consistency with database schema
                req.query.where.company_id = userCompanyId;
            }
            
            // For create/update operations, automatically set the company
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                if (!req.body) {
                    req.body = {};
                }
                
                // Prevent users from setting different company_id
                if (req.body.company_id && req.body.company_id !== userCompanyId) {
                    return res.status(403).json({
                        status: false,
                        message: 'Access denied: Cannot access different company data'
                    });
                }
                
                // Set company_id for the user's company
                req.body.company_id = userCompanyId;
            }
            
            // Store company context for use in controllers
            req.userCompanyId = userCompanyId;
            
            next();
        } catch (error) {
            console.error('Company access middleware error:', error.message);
            res.status(500).json({
                status: false,
                message: 'Internal server error during company access validation'
            });
        }
    };
};

module.exports = {
    ensureCompanyAccess
}; 