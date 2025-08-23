"use strict";

const tableAdds = [
  { table: "users", column: "site_id", options: { type: "INTEGER", after: "company_id" } },
  { table: "asset_hierarchy", column: "site_id", options: { type: "INTEGER", after: "company_id" } },
  { table: "task_hazards", column: "site_id", options: { type: "INTEGER", after: "company_id" } },
  { table: "risk_assessments", column: "site_id", options: { type: "INTEGER", after: "company_id" } },
  { table: "file_uploads", column: "site_id", options: { type: "INTEGER", after: "company_id" } },
  { table: "tactics", column: "site_id", options: { type: "INTEGER", after: "company_id" } }
];

async function addColumnSafe(queryInterface, Sequelize, table, column, options) {
  const [res] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}' LIMIT 1;`
  );
  if (res && res.length > 0) return;
  await queryInterface.addColumn(table, column, { type: Sequelize.INTEGER, allowNull: true });
  await queryInterface.addIndex(table, [column], { name: `idx_${table}_${column}` });
  await queryInterface.addConstraint(table, {
    fields: [column],
    type: 'foreign key',
    name: `fk_${table}_${column}`,
    references: { table: 'sites', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  });
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    for (const spec of tableAdds) {
      await addColumnSafe(queryInterface, Sequelize, spec.table, spec.column, spec.options);
    }
  },
  down: async (queryInterface) => {
    // Drop FKs and columns if they exist
    for (const spec of tableAdds) {
      // Best-effort: ignore failures if already removed
      try { await queryInterface.removeConstraint(spec.table, `fk_${spec.table}_${spec.column}`); } catch (_) {}
      try { await queryInterface.removeIndex(spec.table, `idx_${spec.table}_${spec.column}`); } catch (_) {}
      try { await queryInterface.removeColumn(spec.table, spec.column); } catch (_) {}
    }
  }
};


