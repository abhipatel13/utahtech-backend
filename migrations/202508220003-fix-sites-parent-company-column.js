"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Ensure sites table exists
    const [tables] = await queryInterface.sequelize.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sites' LIMIT 1;"
    );
    if (!tables || tables.length === 0) {
      throw new Error("sites table not found; run create-sites migration first");
    }

    // If parent_company_id is missing but parentCompanyId or parentcompanyid exists, rename to snake_case
    const [cols] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sites';"
    );
    const names = cols.map(r => r.column_name || r.COLUMN_NAME);
    const hasSnake = names.includes('parent_company_id');
    const hasCamel = names.includes('parentCompanyId');
    const hasLower = names.includes('parentcompanyid');

    if (!hasSnake) {
      if (hasCamel) {
        await queryInterface.renameColumn('sites', 'parentCompanyId', 'parent_company_id');
      } else if (hasLower) {
        await queryInterface.renameColumn('sites', 'parentcompanyid', 'parent_company_id');
      } else {
        // Add the column if none exist
        await queryInterface.addColumn('sites', 'parent_company_id', {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'company', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        });
      }
    }

    // Add index and FK if missing
    try { await queryInterface.addIndex('sites', ['parent_company_id'], { name: 'idx_sites_parent_company_id' }); } catch (_) {}
  },

  down: async (queryInterface, Sequelize) => {
    // Best-effort: do not drop the normalized column in down; no-op to avoid data loss
  }
};


