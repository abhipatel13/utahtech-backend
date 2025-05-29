'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('tactics', 'company', {
      type: Sequelize.STRING(150),
      allowNull: false,
      references: {
        model: 'users',
        key: 'company'
      }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('tactics', 'company');
  }
};
