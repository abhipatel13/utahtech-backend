
const getCompanyId = async (req) => {
  const userCompanyId = req.userCompanyId || req.user.company_id;
  return userCompanyId;
}

const getSiteId = async (req) => {
  const userSiteId = req.userSiteId || req.user.site_id;
  return userSiteId;
}

module.exports = {
  getCompanyId,
  getSiteId
};
