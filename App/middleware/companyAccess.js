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

            // Universal users have unrestricted access to all companies
            if (req.user.role === 'universal_user') {
                return next();
            }

            // Get company ID from user (prefer company_id over company)
            const userCompanyId = req.user.company_id || req.user.company?.id;
            const userSiteId = req.user.site_id || req.user.site?.id;
            
            if (!userCompanyId || !userSiteId) {
                console.error('Company access middleware: User missing company information', {
                    userId: req.user.id,
                    userRole: req.user.role,
                    userCompanyId: userCompanyId,
                    userSiteId: userSiteId
                });
                return res.status(403).json({
                    status: false,
                    message: 'Access denied: User company information missing'
                });
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
                req.body.site_id = userSiteId;
            }
            
            // Store company context for use in controllers
            req.userCompanyId = userCompanyId;
            req.userSiteId = userSiteId;
            
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