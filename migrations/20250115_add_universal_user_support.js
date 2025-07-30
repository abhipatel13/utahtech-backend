'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Make company_id nullable to support universal_user role
    await queryInterface.changeColumn('users', 'company_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'company',
        key: 'id'
      }
    });
    
    console.log('✓ Updated users table: company_id is now nullable for universal_user support');
  },

  down: async (queryInterface, Sequelize) => {
    // Revert company_id to not null (this may fail if universal users exist)
    await queryInterface.changeColumn('users', 'company_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    });
    
    console.log('✓ Reverted users table: company_id is now required');
  }
}; 