'use strict';

const dbConfig = require('../App/configs/db.config.js');

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('asset_hierarchy', 'company', {
        type: Sequelize.STRING(150),
        allowNull: true,
        references: {
          model: 'users',
          key: 'company'
        }
      });
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.removeColumn('asset_hierarchy', 'company');
      console.log('Removed company column from asset_hierarchy table');
    } catch (error) {
      console.error('Migration rollback failed:', error);
      throw error;
    }
  }
}; 