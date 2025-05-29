'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('asset_hierarchy', 'company', {
      type: Sequelize.STRING(150),
      allowNull: true,
      references: {
        model: 'users',
        key: 'company'
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('asset_hierarchy', 'company');
  }
}; 