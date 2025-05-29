const ensureCompanyAccess = (model) => {
    return async (req, res, next) => {
        try {
            // Get the user's company from the authenticated user
            const userCompany = req.user.company;
            
            // Add company filter to the request query
            if (!req.query) {
                req.query = {};
            }
            
            // Add company filter to any existing where clause
            if (!req.query.where) {
                req.query.where = {};
            }
            
            req.query.where.company = userCompany;
            
            // For create operations, automatically set the company
            if (req.method === 'POST') {
                if (!req.body) {
                    req.body = {};
                }
                req.body.company = userCompany;
            }
            
            next();
        } catch (error) {
            console.error('Company access middleware error:', error);
            res.status(403).json({
                status: false,
                message: 'Access denied: Company mismatch'
            });
        }
    };
};

module.exports = {
    ensureCompanyAccess
}; 