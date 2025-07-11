'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('license_pools', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      pool_name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Name/description of the license pool'
      },
      purchased_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'Superuser who purchased the bulk licenses'
      },
      total_licenses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Total number of licenses purchased'
      },
      allocated_licenses: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Number of licenses currently allocated'
      },
      license_type: {
        type: Sequelize.ENUM('monthly', 'quarterly', 'semi_annual', 'annual'),
        allowNull: false,
        defaultValue: 'monthly',
        comment: 'Type of license (determines validity period)'
      },
      validity_period_months: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Validity period in months for each license'
      },
      total_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Total amount paid for the bulk purchase'
      },
      price_per_license: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Price per individual license'
      },
      purchase_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false
      },
      pool_expiry_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date when the license pool expires (optional)'
      },
      status: {
        type: Sequelize.ENUM('active', 'expired', 'suspended'),
        defaultValue: 'active'
      },
      company_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'company',
          key: 'id'
        },
        comment: 'Company this license pool belongs to'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Additional notes about the license pool'
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
    await queryInterface.addIndex('license_pools', ['purchased_by']);
    await queryInterface.addIndex('license_pools', ['status']);
    await queryInterface.addIndex('license_pools', ['company_id']);
    await queryInterface.addIndex('license_pools', ['license_type']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('license_pools');
  }
}; 