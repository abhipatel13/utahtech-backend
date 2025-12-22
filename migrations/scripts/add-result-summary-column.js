/**
 * Migration script to add result_summary column to file_uploads table
 * 
 * This adds the result_summary TEXT column that stores JSON data
 * for tracking import/processing results.
 * 
 * Run with: node migrations/scripts/add-result-summary-column.js
 */

const db = require('../../App/models');

async function migrate() {
  try {
    console.log('Adding result_summary column to file_uploads table...\n');

    // Check if column already exists
    const [columns] = await db.sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'file_uploads' 
        AND COLUMN_NAME = 'result_summary'
    `);

    if (columns.length > 0) {
      console.log('✅ Column result_summary already exists, skipping.');
      process.exit(0);
    }

    // Add the column - matches model definition:
    // - TEXT type for JSON storage
    // - NULL allowed (allowNull: true)
    await db.sequelize.query(`
      ALTER TABLE file_uploads 
      ADD COLUMN result_summary TEXT NULL
    `);

    console.log('✅ Column result_summary added successfully!');
    process.exit(0);
  } catch (error) {
    // Handle duplicate column error (MySQL error code 1060)
    if (error.original?.errno === 1060 || error.message.includes('Duplicate column')) {
      console.log('✅ Column result_summary already exists, skipping.');
      process.exit(0);
    }
    
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

migrate();
