'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('Starting polymorphic migration for supervisor_approvals...');
      
      // Access the sequelize instance through the context
      const sequelize = queryInterface.context?.sequelize || queryInterface.sequelize;
      if (!sequelize) {
        throw new Error('Sequelize instance not found in queryInterface or context');
      }
      
      // Step 1: Add the new polymorphic columns
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        ADD COLUMN approvable_id INT NULL,
        ADD COLUMN approvable_type VARCHAR(255) NULL
      `);

      // Step 2: Migrate existing data from task_hazard_id to polymorphic fields
      await sequelize.query(`
        UPDATE supervisor_approvals 
        SET 
          approvable_id = task_hazard_id,
          approvable_type = 'task_hazards'
        WHERE task_hazard_id IS NOT NULL
      `);

      // Step 3: Make the new columns NOT NULL (since all existing data should now be migrated)
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        MODIFY COLUMN approvable_id INT NOT NULL,
        MODIFY COLUMN approvable_type VARCHAR(255) NOT NULL
      `);

      // Step 4: Rename the snapshot column to be more generic
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        CHANGE COLUMN task_hazard_snapshot approvable_snapshot JSON NOT NULL
      `);

      // Step 5: Drop the foreign key constraint before removing task_hazard_id column
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        DROP FOREIGN KEY supervisor_approvals_ibfk_1
      `);

      // Step 6: Remove the old task_hazard_id column
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        DROP COLUMN task_hazard_id
      `);

      // Step 7: Add indexes for better performance on polymorphic queries
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        ADD INDEX supervisor_approvals_approvable_idx (approvable_id, approvable_type),
        ADD INDEX supervisor_approvals_type_status_idx (approvable_type, status),
        ADD INDEX supervisor_approvals_supervisor_status_idx (supervisor_id, status, is_invalidated)
      `);

      console.log('Successfully migrated supervisor_approvals to polymorphic structure');
    } catch (error) {
      console.error('Failed to migrate supervisor_approvals:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('Starting rollback of supervisor_approvals migration...');
      
      const sequelize = queryInterface.context?.sequelize || queryInterface.sequelize;
      if (!sequelize) {
        throw new Error('Sequelize instance not found in queryInterface or context');
      }
      
      // Step 1: Remove the new indexes
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        DROP INDEX supervisor_approvals_approvable_idx,
        DROP INDEX supervisor_approvals_type_status_idx,
        DROP INDEX supervisor_approvals_supervisor_status_idx
      `);

      // Step 2: Re-add the task_hazard_id column
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        ADD COLUMN task_hazard_id INT NULL
      `);

      // Step 3: Migrate data back from polymorphic fields to task_hazard_id (only for task_hazards)
      await sequelize.query(`
        UPDATE supervisor_approvals 
        SET task_hazard_id = approvable_id
        WHERE approvable_type = 'task_hazards'
      `);

      // Step 4: Delete any approvals that are not for task hazards (since the old structure doesn't support them)
      const deletedResult = await sequelize.query(`
        DELETE FROM supervisor_approvals 
        WHERE approvable_type != 'task_hazards'
      `);
      
      if (deletedResult[1] && deletedResult[1].affectedRows > 0) {
        console.log(`Warning: Deleted ${deletedResult[1].affectedRows} supervisor approvals that were not for task hazards`);
      }

      // Step 5: Make task_hazard_id NOT NULL
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        MODIFY COLUMN task_hazard_id INT NOT NULL
      `);

      // Step 6: Rename the snapshot column back
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        CHANGE COLUMN approvable_snapshot task_hazard_snapshot JSON NOT NULL
      `);

      // Step 7: Re-add the foreign key constraint for task_hazard_id
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        ADD CONSTRAINT supervisor_approvals_ibfk_1 
        FOREIGN KEY (task_hazard_id) REFERENCES task_hazards(id)
      `);

      // Step 8: Remove the polymorphic columns
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        DROP COLUMN approvable_id,
        DROP COLUMN approvable_type
      `);

      console.log('Successfully rolled back supervisor_approvals to original structure');
    } catch (error) {
      console.error('Failed to rollback supervisor_approvals migration:', error);
      throw error;
    }
  }
};
