"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Inspect columns on sites
    const [cols] = await queryInterface.sequelize.query(
      "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sites';"
    );
    const names = new Set(cols.map(r => r.column_name || r.COLUMN_NAME));

    const hasParentSnake = names.has('parent_company_id');
    const hasCompanyId = names.has('company_id');

    if (hasCompanyId && !hasParentSnake) {
      // Legacy schema: rename company_id -> parent_company_id
      await queryInterface.renameColumn('sites', 'company_id', 'parent_company_id');
      await queryInterface.addIndex('sites', ['parent_company_id'], { name: 'idx_sites_parent_company_id' });
      return;
    }

    if (hasCompanyId && hasParentSnake) {
      // Both columns exist. Make legacy company_id nullable to avoid insert errors.
      try {
        await queryInterface.changeColumn('sites', 'company_id', {
          type: Sequelize.INTEGER,
          allowNull: true
        });
      } catch (_) {}
      // Optional: backfill legacy company_id from parent_company_id where null
      try {
        await queryInterface.sequelize.query(
          'UPDATE `sites` SET `company_id` = `parent_company_id` WHERE `company_id` IS NULL'
        );
      } catch (_) {}
    }
  },

  down: async (queryInterface, Sequelize) => {
    // No-op; we avoid destructive down migration here
  }
};


