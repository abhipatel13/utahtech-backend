"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if table already exists
    const [results] = await queryInterface.sequelize.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sites' LIMIT 1;"
    );

    if (results && results.length > 0) {
      return; // sites table already exists
    }

    await queryInterface.createTable("sites", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      parent_company_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "company", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      deleted_at: { type: Sequelize.DATE, allowNull: true }
    });

    await queryInterface.addIndex("sites", ["parent_company_id"], { name: "idx_sites_parent_company_id" });
    await queryInterface.addIndex("sites", ["name"], { name: "idx_sites_name" });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("sites");
  }
};


