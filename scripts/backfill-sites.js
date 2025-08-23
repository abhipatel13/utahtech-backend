/* eslint-disable no-console */
"use strict";

// Standalone script to backfill site_id values across tables.
// Strategy:
// 1) For each company without sites, create one default site (name = company.name).
// 2) For users: set site_id to the first site of their company if null.
// 3) For operational tables (asset_hierarchy, task_hazards, risk_assessments, tactics, file_uploads):
//    set site_id based on the user's site or default company site when null.

const models = require('../App/models');

async function ensureDefaultSites(transaction) {
  const companies = await models.company.findAll({ paranoid: false, transaction });
  for (const company of companies) {
    const existingSites = await models.site.findAll({ where: { parentCompanyId: company.id }, paranoid: false, transaction });
    if (existingSites.length === 0) {
      await models.site.create({ name: company.name, parentCompanyId: company.id }, { transaction });
      console.log(`Created default site for company ${company.id} (${company.name})`);
    }
  }
}

async function getDefaultSiteIdForCompany(companyId, transaction) {
  const site = await models.site.findOne({ where: { parentCompanyId: companyId }, order: [['id', 'ASC']], paranoid: false, transaction });
  return site ? site.id : null;
}

async function backfillUsers(transaction) {
  const users = await models.user.unscoped().findAll({ paranoid: false, transaction });
  for (const user of users) {
    if (!user.company_id) continue;
    if (user.site_id) continue;
    const siteId = await getDefaultSiteIdForCompany(user.company_id, transaction);
    if (siteId) {
      await user.update({ site_id: siteId }, { transaction });
    }
  }
  console.log('Backfilled users.site_id');
}

async function backfillTableByCompany(model, companyFieldName, transaction) {
  const records = await model.unscoped().findAll({ paranoid: false, transaction });
  for (const rec of records) {
    if (rec[companyFieldName] == null) continue;
    if (rec.siteId != null || rec.site_id != null) continue;
    const siteId = await getDefaultSiteIdForCompany(rec[companyFieldName], transaction);
    if (siteId) {
      const updateData = rec.dataValues.hasOwnProperty('siteId') ? { siteId } : { site_id: siteId };
      await rec.update(updateData, { transaction });
    }
  }
  console.log(`Backfilled ${model.name}.site_id`);
}

async function main() {
  const sequelize = models.sequelize;
  const transaction = await sequelize.transaction();
  try {
    await ensureDefaultSites(transaction);
    await backfillUsers(transaction);
    await backfillTableByCompany(models.asset_hierarchy, 'companyId', transaction);
    await backfillTableByCompany(models.task_hazards, 'companyId', transaction);
    await backfillTableByCompany(models.risk_assessments, 'companyId', transaction);
    await backfillTableByCompany(models.tactics, 'company_id', transaction);
    await backfillTableByCompany(models.file_uploads, 'companyId', transaction);
    await transaction.commit();
    console.log('Backfill completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    await transaction.rollback();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}


