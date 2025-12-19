/**
 * Migration: Fix unique constraints for soft-delete (paranoid) tables
 * 
 * Problem: MySQL treats NULL != NULL in unique indexes, so
 * UNIQUE(external_id, company_id, deleted_at) allows duplicates
 * when deleted_at is NULL for multiple rows.
 * 
 * Solution: Use functional indexes (MySQL 8.0+) that only enforce
 * uniqueness on active (non-deleted) records.
 * 
 * Run with: node migrations/scripts/fix-unique-constraints-soft-delete.js
 */

const db = require('../../App/models');

async function migrate() {
  const queryInterface = db.sequelize.getQueryInterface();
  
  try {
    console.log('Fixing unique constraints for soft-delete tables...\n');

    // ============================================
    // 1. Fix asset_hierarchy unique constraint
    // ============================================
    console.log('1. Fixing asset_hierarchy...');
    
    // Drop existing unique index if it exists
    try {
      await db.sequelize.query(`
        DROP INDEX unique_external_id_per_company ON asset_hierarchy
      `);
      console.log('   Dropped old index: unique_external_id_per_company');
    } catch (e) {
      if (!e.message.includes("check that it exists")) {
        console.log('   Index unique_external_id_per_company does not exist, skipping drop');
      }
    }

    // Create functional index for active records only
    await db.sequelize.query(`
      CREATE UNIQUE INDEX unique_active_external_id_per_company 
      ON asset_hierarchy(
        (CASE WHEN deleted_at IS NULL THEN external_id END),
        company_id
      )
    `);
    console.log('   ✅ Created functional index: unique_active_external_id_per_company');

    // ============================================
    // 2. Fix users unique constraint (email)
    // ============================================
    console.log('\n2. Fixing users...');
    
    // Check if there's an existing unique index on email
    const [emailIndexes] = await db.sequelize.query(`
      SHOW INDEX FROM users WHERE Column_name = 'email' AND Non_unique = 0
    `);
    
    for (const idx of emailIndexes) {
      if (idx.Key_name !== 'PRIMARY') {
        try {
          await db.sequelize.query(`DROP INDEX \`${idx.Key_name}\` ON users`);
          console.log(`   Dropped old index: ${idx.Key_name}`);
        } catch (e) {
          console.log(`   Could not drop index ${idx.Key_name}: ${e.message}`);
        }
      }
    }

    // Create functional index for active users only
    await db.sequelize.query(`
      CREATE UNIQUE INDEX unique_active_email 
      ON users(
        (CASE WHEN deleted_at IS NULL THEN email END)
      )
    `);
    console.log('   ✅ Created functional index: unique_active_email');

    console.log('\n✅ All unique constraints fixed successfully!');
    console.log('\nNote: These indexes enforce uniqueness only on active (non-deleted) records.');
    console.log('Deleted records can have duplicate values.');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

migrate();

