'use strict';

/**
 * Migration: Make supervisor_approvals polymorphic
 * 
 * This migration transforms the supervisor_approvals table from a task-hazard-only
 * structure to a polymorphic structure that can handle approvals for both
 * task hazards and risk assessments.
 * 
 * Changes:
 * - Adds approvable_id and approvable_type columns
 * - Migrates existing task_hazard_id data to polymorphic fields
 * - Renames task_hazard_snapshot to approvable_snapshot
 * - Removes the task_hazard_id column and its foreign key
 * - Adds performance indexes
 */
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
      console.log('Step 1: Adding approvable_id and approvable_type columns...');
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        ADD COLUMN approvable_id INT NULL,
        ADD COLUMN approvable_type VARCHAR(255) NULL
      `);

      // Step 2: Migrate existing data from task_hazard_id to polymorphic fields
      console.log('Step 2: Migrating existing data to polymorphic fields...');
      await sequelize.query(`
        UPDATE supervisor_approvals 
        SET 
          approvable_id = task_hazard_id,
          approvable_type = 'task_hazards'
        WHERE task_hazard_id IS NOT NULL
      `);

      // Step 3: Make the new columns NOT NULL (since all existing data should now be migrated)
      console.log('Step 3: Making polymorphic columns NOT NULL...');
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        MODIFY COLUMN approvable_id INT NOT NULL,
        MODIFY COLUMN approvable_type VARCHAR(255) NOT NULL
      `);

      // Step 4: Rename the snapshot column to be more generic
      console.log('Step 4: Renaming task_hazard_snapshot to approvable_snapshot...');
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        CHANGE COLUMN task_hazard_snapshot approvable_snapshot JSON NOT NULL
      `);

      // Step 5: Drop the foreign key constraint before removing task_hazard_id column
      console.log('Step 5: Dropping foreign key constraint...');
      try {
        await sequelize.query(`
          ALTER TABLE supervisor_approvals 
          DROP FOREIGN KEY supervisor_approvals_ibfk_1
        `);
      } catch (fkError) {
        // FK might have a different name, try to find and drop it
        console.log('Could not drop supervisor_approvals_ibfk_1, attempting to find constraint name...');
        const [constraints] = await sequelize.query(`
          SELECT CONSTRAINT_NAME 
          FROM information_schema.KEY_COLUMN_USAGE 
          WHERE TABLE_NAME = 'supervisor_approvals' 
          AND COLUMN_NAME = 'task_hazard_id' 
          AND REFERENCED_TABLE_NAME IS NOT NULL
        `);
        
        if (constraints && constraints.length > 0) {
          for (const constraint of constraints) {
            await sequelize.query(`
              ALTER TABLE supervisor_approvals 
              DROP FOREIGN KEY ${constraint.CONSTRAINT_NAME}
            `);
            console.log(`Dropped foreign key: ${constraint.CONSTRAINT_NAME}`);
          }
        }
      }

      // Step 6: Remove the old task_hazard_id column
      console.log('Step 6: Removing task_hazard_id column...');
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        DROP COLUMN task_hazard_id
      `);

      // Step 7: Add indexes for better performance on polymorphic queries
      console.log('Step 7: Adding performance indexes...');
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
      console.log('Step 1: Removing indexes...');
      try {
        await sequelize.query(`
          ALTER TABLE supervisor_approvals 
          DROP INDEX supervisor_approvals_approvable_idx,
          DROP INDEX supervisor_approvals_type_status_idx,
          DROP INDEX supervisor_approvals_supervisor_status_idx
        `);
      } catch (indexError) {
        console.log('Some indexes may not exist, continuing...');
      }

      // Step 2: Re-add the task_hazard_id column
      console.log('Step 2: Re-adding task_hazard_id column...');
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        ADD COLUMN task_hazard_id INT NULL
      `);

      // Step 3: Migrate data back from polymorphic fields to task_hazard_id (only for task_hazards)
      console.log('Step 3: Migrating data back to task_hazard_id...');
      await sequelize.query(`
        UPDATE supervisor_approvals 
        SET task_hazard_id = approvable_id
        WHERE approvable_type = 'task_hazards'
      `);

      // Step 4: Delete any approvals that are not for task hazards (since the old structure doesn't support them)
      console.log('Step 4: Removing non-task-hazard approvals...');
      const [deletedResult] = await sequelize.query(`
        DELETE FROM supervisor_approvals 
        WHERE approvable_type != 'task_hazards'
      `);
      
      if (deletedResult && deletedResult.affectedRows > 0) {
        console.log(`Warning: Deleted ${deletedResult.affectedRows} supervisor approvals that were not for task hazards`);
      }

      // Step 5: Make task_hazard_id NOT NULL
      console.log('Step 5: Making task_hazard_id NOT NULL...');
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        MODIFY COLUMN task_hazard_id INT NOT NULL
      `);

      // Step 6: Rename the snapshot column back
      console.log('Step 6: Renaming approvable_snapshot back to task_hazard_snapshot...');
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        CHANGE COLUMN approvable_snapshot task_hazard_snapshot JSON NOT NULL
      `);

      // Step 7: Re-add the foreign key constraint for task_hazard_id
      console.log('Step 7: Re-adding foreign key constraint...');
      await sequelize.query(`
        ALTER TABLE supervisor_approvals 
        ADD CONSTRAINT supervisor_approvals_ibfk_1 
        FOREIGN KEY (task_hazard_id) REFERENCES task_hazards(id)
      `);

      // Step 8: Remove the polymorphic columns
      console.log('Step 8: Removing polymorphic columns...');
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





