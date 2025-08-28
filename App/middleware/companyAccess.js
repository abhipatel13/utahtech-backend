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
            let whereClause = {};
            if (!req.whereClause) {
                req.whereClause = {};
            }

            // Universal users have unrestricted access to all companies
            if (req.user.role === 'universal_user') {
                if (req.params.company_id) {
                    whereClause.company_id = req.params.company_id;
                }
                req.whereClause = whereClause;
                return next();
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
            
            // For non-superusers, enforce company access restrictions
            // Add company filter to query parameters for GET requests
            if (req.method === 'GET') {
                if (!req.query) {
                    req.query = {};
                }
                
                if (!req.query.where) {
                    req.query.where = {};
                }
                
                req.query.where.company_id = userCompanyId;
                req.whereClause.company_id = userCompanyId;
            }
            
            // For create/update operations, automatically set the company
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                if (!req.body) {
                    req.body = {};
                }
                
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