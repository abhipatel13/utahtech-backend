'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First remove old columns
    await queryInterface.removeColumn('asset_hierarchy', 'fmea');
    await queryInterface.removeColumn('asset_hierarchy', 'actions');
    await queryInterface.removeColumn('asset_hierarchy', 'criticality_assessment');
    await queryInterface.removeColumn('asset_hierarchy', 'inspection_points');

    // Add new columns
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn('asset_hierarchy', 'internal_id', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'maintenance_plant', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'primary_key', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'cmms_system', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'site_reference', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'object_type', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'system_status', {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'Active'
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'make', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'manufacturer', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'serial_number', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove new columns
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('asset_hierarchy', 'internal_id', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'maintenance_plant', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'primary_key', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'cmms_system', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'site_reference', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'object_type', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'system_status', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'make', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'manufacturer', { transaction });
      await queryInterface.removeColumn('asset_hierarchy', 'serial_number', { transaction });

      // Restore old columns
      await queryInterface.addColumn('asset_hierarchy', 'fmea', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'actions', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'criticality_assessment', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('asset_hierarchy', 'inspection_points', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });
    });
  }
}; 