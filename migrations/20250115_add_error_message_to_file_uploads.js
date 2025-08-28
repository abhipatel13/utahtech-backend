'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add errorMessage column
    await queryInterface.addColumn('file_uploads', 'error_message', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    // Update the status enum to include 'processing'
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_file_uploads_status" ADD VALUE 'processing'
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the errorMessage column
    await queryInterface.removeColumn('file_uploads', 'error_message');

    // Note: PostgreSQL doesn't support removing enum values directly
    // In a production environment, you might need to recreate the enum type
    // For now, we'll leave the 'processing' value in the enum
  }
};