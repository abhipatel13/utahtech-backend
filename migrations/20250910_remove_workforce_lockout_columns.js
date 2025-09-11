'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('Starting removal of trained_workforce and system_lockout_required columns...');
      
      // Access the sequelize instance through the context
      const sequelize = queryInterface.context?.sequelize || queryInterface.sequelize;
      if (!sequelize) {
        throw new Error('Sequelize instance not found in queryInterface or context');
      }
      
      // Step 1: Remove the trained_workforce column
      await sequelize.query(`
        ALTER TABLE risk_assessments 
        DROP COLUMN trained_workforce
      `);

      // Step 2: Remove the system_lockout_required column
      await sequelize.query(`
        ALTER TABLE risk_assessments 
        DROP COLUMN system_lockout_required
      `);

      console.log('Successfully removed trained_workforce and system_lockout_required columns from risk_assessments');
    } catch (error) {
      console.error('Failed to remove columns from risk_assessments:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('↩️ Starting rollback - re-adding trained_workforce and system_lockout_required columns...');
      
      const sequelize = queryInterface.context?.sequelize || queryInterface.sequelize;
      if (!sequelize) {
        throw new Error('Sequelize instance not found in queryInterface or context');
      }
      
      // Step 1: Re-add the trained_workforce column
      await sequelize.query(`
        ALTER TABLE risk_assessments 
        ADD COLUMN trained_workforce BOOLEAN NOT NULL DEFAULT FALSE
      `);

      // Step 2: Re-add the system_lockout_required column
      await sequelize.query(`
        ALTER TABLE risk_assessments 
        ADD COLUMN system_lockout_required BOOLEAN DEFAULT FALSE
      `);

      console.log('Successfully rolled back - re-added trained_workforce and system_lockout_required columns to risk_assessments');
    } catch (error) {
      console.error('Failed to rollback column removal from risk_assessments:', error);
      throw error;
    }
  }
};
