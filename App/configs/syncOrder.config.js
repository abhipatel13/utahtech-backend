/**
 * Model Sync Order Configuration
 * 
 * This file defines the order in which Sequelize models should be synced
 * to avoid foreign key constraint errors when creating tables.
 * 
 * Tables are organized into tiers based on their foreign key dependencies:
 * - Tier 1: Base tables with no foreign key dependencies
 * - Tier 2: Tables that only depend on Tier 1
 * - Tier 3: Tables that depend on Tier 1-2
 * - Tier 4: Tables that depend on Tier 1-3
 * - Tier 5: Child tables and junction tables
 * 
 * When adding a new model, place it in the appropriate tier based on
 * which tables it references via foreign keys.
 */

const MODEL_SYNC_ORDER = [
  // ============================================
  // Tier 1: Base tables (no foreign key dependencies)
  // ============================================
  'company',
  'risk_matrices',

  // ============================================
  // Tier 2: Tables that only depend on Tier 1
  // ============================================
  'user',            // depends on: company (self-ref supervisor_id is handled by Sequelize)
  'asset_hierarchy', // depends on: company (self-ref parent is handled by Sequelize)
  'tactics',         // depends on: company

  // ============================================
  // Tier 3: Tables that depend on Tier 1-2
  // ============================================
  'file_uploads',    // depends on: company, user
  'reset_passwords', // depends on: user
  'notifications',   // depends on: user
  'license_pools',   // depends on: user, company

  // ============================================
  // Tier 4: Tables that depend on Tier 1-3
  // ============================================
  'license_allocations', // depends on: license_pools, user, company
  'task_hazards',        // depends on: company, asset_hierarchy, user
  'risk_assessments',    // depends on: company, asset_hierarchy, user

  // ============================================
  // Tier 5: Child tables and junction tables
  // ============================================
  'task_risks',                  // depends on: task_hazards
  'risk_assessment_risks',       // depends on: risk_assessments
  'task_hazard_individuals',     // depends on: task_hazards, user
  'risk_assessment_individuals', // depends on: risk_assessments, user
  'supervisor_approvals',        // depends on: user (polymorphic refs to task_hazards/risk_assessments)
];

module.exports = { MODEL_SYNC_ORDER };

