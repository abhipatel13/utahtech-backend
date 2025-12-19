'use strict';

const { v7: uuidv7 } = require('uuid');

/**
 * Migration: Add Internal/External ID System to Asset Hierarchy
 * 
 * This migration:
 * 1. Adds external_id column (populated from stripped current id)
 * 2. Creates mapping of old IDs to new UUIDs
 * 3. Updates all foreign key references (task_hazards, risk_assessments, parent_id)
 * 4. Replaces the id column with UUIDs
 * 5. Adds unique constraint on (external_id, company_id, deleted_at)
 */

/**
 * Strip timestamp suffix from asset ID
 * Pattern: ID ending with -[13-digit-timestamp] (timestamps from 2020-2030)
 */
function stripTimestamp(id) {
  if (!id) return id;
  const timestampPattern = /-1[5-7]\d{11}$/;
  return id.replace(timestampPattern, '');
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // Access the sequelize instance through the context (same pattern as existing migration)
    const sequelize = queryInterface.context?.sequelize || queryInterface.sequelize;
    if (!sequelize) {
      throw new Error('Sequelize instance not found in queryInterface or context');
    }

    try {
      console.log('Starting migration: Internal/External Asset ID System');
      
      // Step 1: Add external_id column
      console.log('Step 1: Adding external_id column...');
      await sequelize.query(`
        ALTER TABLE asset_hierarchy 
        ADD COLUMN external_id VARCHAR(255) NULL
      `);

      // Step 2: Add new_id column for UUIDs
      console.log('Step 2: Adding new_id column for UUIDs...');
      await sequelize.query(`
        ALTER TABLE asset_hierarchy 
        ADD COLUMN new_id CHAR(36) NULL
      `);

      // Step 3: Populate external_id (strip timestamps) and generate UUIDs
      console.log('Step 3: Populating external_id and generating UUIDs...');
      
      // Fetch all assets
      const [assets] = await sequelize.query(
        'SELECT id, company_id FROM asset_hierarchy'
      );

      console.log(`Processing ${assets.length} assets...`);

      // Build ID mapping (old_id -> new_uuid)
      const idMapping = new Map();
      
      for (const asset of assets) {
        const newUuid = uuidv7();
        const externalId = stripTimestamp(asset.id);
        
        idMapping.set(asset.id, newUuid);
        
        // Escape values for SQL
        const escapedExternalId = externalId.replace(/'/g, "''");
        const escapedOldId = asset.id.replace(/'/g, "''");
        
        await sequelize.query(`
          UPDATE asset_hierarchy 
          SET external_id = '${escapedExternalId}', new_id = '${newUuid}' 
          WHERE id = '${escapedOldId}'
        `);
      }

      console.log('ID mapping created for all assets.');

      // Step 4: Update parent_id references to use new UUIDs
      console.log('Step 4: Updating parent_id references...');
      
      // First, add new_parent_id column
      await sequelize.query(`
        ALTER TABLE asset_hierarchy 
        ADD COLUMN new_parent_id CHAR(36) NULL
      `);

      // Update new_parent_id with mapped UUIDs
      const [assetsWithParents] = await sequelize.query(
        'SELECT id, parent_id FROM asset_hierarchy WHERE parent_id IS NOT NULL'
      );

      for (const asset of assetsWithParents) {
        const newParentId = idMapping.get(asset.parent_id);
        if (newParentId) {
          const escapedOldId = asset.id.replace(/'/g, "''");
          await sequelize.query(`
            UPDATE asset_hierarchy 
            SET new_parent_id = '${newParentId}' 
            WHERE id = '${escapedOldId}'
          `);
        }
      }

      // Step 5: Update task_hazards foreign key
      console.log('Step 5: Updating task_hazards references...');
      
      // Check if column exists
      const [taskHazardsCheck] = await sequelize.query(`
        SELECT COUNT(*) as count FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'task_hazards' 
        AND column_name = 'asset_hierarchy_id'
      `);
      
      if (taskHazardsCheck[0].count > 0) {
        // Add new column for UUID reference
        await sequelize.query(`
          ALTER TABLE task_hazards 
          ADD COLUMN new_asset_hierarchy_id CHAR(36) NULL
        `);

        // Update with mapped UUIDs
        const [taskHazards] = await sequelize.query(
          'SELECT id, asset_hierarchy_id FROM task_hazards WHERE asset_hierarchy_id IS NOT NULL'
        );

        for (const th of taskHazards) {
          const newAssetId = idMapping.get(th.asset_hierarchy_id);
          if (newAssetId) {
            await sequelize.query(`
              UPDATE task_hazards 
              SET new_asset_hierarchy_id = '${newAssetId}' 
              WHERE id = ${th.id}
            `);
          }
        }
      }

      // Step 6: Update risk_assessments foreign key
      console.log('Step 6: Updating risk_assessments references...');
      
      const [riskAssessmentsCheck] = await sequelize.query(`
        SELECT COUNT(*) as count FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'risk_assessments' 
        AND column_name = 'asset_hierarchy_id'
      `);
      
      if (riskAssessmentsCheck[0].count > 0) {
        // Add new column for UUID reference
        await sequelize.query(`
          ALTER TABLE risk_assessments 
          ADD COLUMN new_asset_hierarchy_id CHAR(36) NULL
        `);

        // Update with mapped UUIDs
        const [riskAssessments] = await sequelize.query(
          'SELECT id, asset_hierarchy_id FROM risk_assessments WHERE asset_hierarchy_id IS NOT NULL'
        );

        for (const ra of riskAssessments) {
          const newAssetId = idMapping.get(ra.asset_hierarchy_id);
          if (newAssetId) {
            await sequelize.query(`
              UPDATE risk_assessments 
              SET new_asset_hierarchy_id = '${newAssetId}' 
              WHERE id = ${ra.id}
            `);
          }
        }
      }

      // Step 7: Drop old foreign key constraints
      console.log('Step 7: Dropping old foreign key constraints...');
      
      // Get all foreign key names dynamically
      const [fkConstraints] = await sequelize.query(`
        SELECT CONSTRAINT_NAME, TABLE_NAME 
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE REFERENCED_TABLE_NAME = 'asset_hierarchy' 
        AND TABLE_SCHEMA = DATABASE()
      `);

      for (const fk of fkConstraints) {
        try {
          await sequelize.query(`
            ALTER TABLE ${fk.TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}
          `);
          console.log(`  Removed FK constraint: ${fk.CONSTRAINT_NAME} from ${fk.TABLE_NAME}`);
        } catch (e) {
          console.log(`  Note: Could not remove ${fk.CONSTRAINT_NAME}: ${e.message}`);
        }
      }

      // Step 8: Remove old PRIMARY KEY and add new one
      console.log('Step 8: Updating PRIMARY KEY...');
      
      // Drop primary key
      await sequelize.query(`
        ALTER TABLE asset_hierarchy MODIFY id VARCHAR(255) NOT NULL
      `);
      await sequelize.query(`
        ALTER TABLE asset_hierarchy DROP PRIMARY KEY
      `);

      // Step 9: Rename columns
      console.log('Step 9: Renaming columns...');
      await sequelize.query(`
        ALTER TABLE asset_hierarchy CHANGE COLUMN id old_id VARCHAR(255) NOT NULL
      `);
      await sequelize.query(`
        ALTER TABLE asset_hierarchy CHANGE COLUMN new_id id CHAR(36) NOT NULL
      `);
      
      // Make new id the primary key
      await sequelize.query(`
        ALTER TABLE asset_hierarchy ADD PRIMARY KEY (id)
      `);

      // Drop old parent_id and rename new_parent_id
      await sequelize.query(`
        ALTER TABLE asset_hierarchy DROP COLUMN parent_id
      `);
      await sequelize.query(`
        ALTER TABLE asset_hierarchy CHANGE COLUMN new_parent_id parent_id CHAR(36) NULL
      `);

      // Step 10: Swap columns in related tables
      console.log('Step 10: Swapping columns in related tables...');
      
      if (taskHazardsCheck[0].count > 0) {
        await sequelize.query(`
          ALTER TABLE task_hazards DROP COLUMN asset_hierarchy_id
        `);
        await sequelize.query(`
          ALTER TABLE task_hazards CHANGE COLUMN new_asset_hierarchy_id asset_hierarchy_id CHAR(36) NULL
        `);
      }

      if (riskAssessmentsCheck[0].count > 0) {
        await sequelize.query(`
          ALTER TABLE risk_assessments DROP COLUMN asset_hierarchy_id
        `);
        await sequelize.query(`
          ALTER TABLE risk_assessments CHANGE COLUMN new_asset_hierarchy_id asset_hierarchy_id CHAR(36) NULL
        `);
      }

      // Step 11: Add new foreign key constraints
      console.log('Step 11: Adding new foreign key constraints...');
      
      await sequelize.query(`
        ALTER TABLE asset_hierarchy 
        ADD CONSTRAINT fk_asset_hierarchy_parent 
        FOREIGN KEY (parent_id) REFERENCES asset_hierarchy(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
      `);

      if (taskHazardsCheck[0].count > 0) {
        await sequelize.query(`
          ALTER TABLE task_hazards 
          ADD CONSTRAINT fk_task_hazards_asset 
          FOREIGN KEY (asset_hierarchy_id) REFERENCES asset_hierarchy(id) 
          ON DELETE SET NULL ON UPDATE CASCADE
        `);
      }

      if (riskAssessmentsCheck[0].count > 0) {
        await sequelize.query(`
          ALTER TABLE risk_assessments 
          ADD CONSTRAINT fk_risk_assessments_asset 
          FOREIGN KEY (asset_hierarchy_id) REFERENCES asset_hierarchy(id) 
          ON DELETE SET NULL ON UPDATE CASCADE
        `);
      }

      // Step 12: Make external_id NOT NULL and add unique constraint
      console.log('Step 12: Adding unique constraint on external_id...');
      
      await sequelize.query(`
        ALTER TABLE asset_hierarchy 
        MODIFY COLUMN external_id VARCHAR(255) NOT NULL
      `);

      await sequelize.query(`
        ALTER TABLE asset_hierarchy 
        ADD UNIQUE INDEX unique_external_id_per_company (external_id, company_id, deleted_at)
      `);

      // Step 13: Clean up - remove old_id column
      console.log('Step 13: Cleaning up old columns...');
      await sequelize.query(`
        ALTER TABLE asset_hierarchy DROP COLUMN old_id
      `);

      console.log('Migration completed successfully!');
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // Down migration is complex and risky - recommend restoring from backup instead
    throw new Error('Down migration not supported. Restore from backup if needed.');
  }
};
