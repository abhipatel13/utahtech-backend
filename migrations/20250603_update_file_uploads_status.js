'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, modify the status column to be ENUM type
    await queryInterface.changeColumn('file_uploads', 'status', {
      type: Sequelize.DataTypes.ENUM('uploading', 'completed', 'error'),
      allowNull: false,
      defaultValue: 'uploading'
    });

    // Update any existing NULL values to 'completed'
    await queryInterface.sequelize.query(
      `UPDATE file_uploads SET status = 'completed' WHERE status IS NULL OR status = ''`
    );
  },

  down: async (queryInterface, Sequelize) => {
    // Revert the column type back to STRING
    await queryInterface.changeColumn('file_uploads', 'status', {
      type: Sequelize.DataTypes.STRING,
      allowNull: true
    });
  }
}; 