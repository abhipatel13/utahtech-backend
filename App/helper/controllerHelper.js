
const getCompanyId = (req) => {
  const userCompanyId = req.userCompanyId || req.user.company_id;
  return userCompanyId;
}

module.exports = {
  getCompanyId
};
