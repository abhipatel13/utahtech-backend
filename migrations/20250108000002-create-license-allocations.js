'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('license_allocations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      license_pool_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'license_pools',
          key: 'id'
        },
        comment: 'Reference to the license pool'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'User to whom the license is allocated'
      },
      allocated_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'Admin/Superuser who allocated the license'
      },
      allocation_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false,
        comment: 'Date when the license was allocated'
      },
      activation_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date when the user activated the license'
      },
      valid_from: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Start date of license validity'
      },
      valid_until: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'End date of license validity'
      },
      status: {
        type: Sequelize.ENUM('allocated', 'active', 'expired', 'revoked', 'suspended'),
        defaultValue: 'allocated',
        comment: 'Current status of the license allocation'
      },
      auto_renew: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Whether to automatically renew this license'
      },
      renewal_attempts: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Number of renewal attempts made'
      },
      last_renewal_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date of last renewal'
      },
      usage_metrics: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Usage statistics and metrics for this license'
      },
      features: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Specific features enabled for this license allocation'
      },
      restrictions: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Any restrictions applied to this license'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Additional notes about this allocation'
      },
      revoked_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date when the license was revoked'
      },
      revoked_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'User who revoked the license'
      },
      revoked_reason: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Reason for license revocation'
      },
      company_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'company',
          key: 'id'
        },
        comment: 'Company this allocation belongs to'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('license_allocations', ['license_pool_id']);
    await queryInterface.addIndex('license_allocations', ['user_id']);
    await queryInterface.addIndex('license_allocations', ['status']);
    await queryInterface.addIndex('license_allocations', ['valid_until']);
    await queryInterface.addIndex('license_allocations', ['company_id']);
    
    // Add unique constraint to prevent duplicate allocations
    await queryInterface.addIndex('license_allocations', ['license_pool_id', 'user_id'], {
      unique: true,
      name: 'unique_pool_user_allocation'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('license_allocations');
  }
}; 