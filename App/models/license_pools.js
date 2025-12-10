const { Sequelize } = require('sequelize');

class LicensePool extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER
      },
      poolName: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Name/description of the license pool'
      },
      purchasedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'Superuser who purchased the bulk licenses'
      },
      totalLicenses: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Total number of licenses purchased'
      },
      allocatedLicenses: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Number of licenses currently allocated'
      },
      availableLicenses: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.getDataValue('totalLicenses') - this.getDataValue('allocatedLicenses');
        }
      },
      licenseType: {
        type: DataTypes.ENUM('monthly', 'quarterly', 'semi_annual', 'annual'),
        allowNull: false,
        defaultValue: 'monthly',
        comment: 'Type of license (determines validity period)'
      },
      validityPeriodMonths: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Validity period in months for each license'
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Total amount paid for the bulk purchase'
      },
      pricePerLicense: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Price per individual license'
      },
      purchaseDate: {
        type: DataTypes.DATE,
        defaultValue: new Date(),
        allowNull: false
      },
      poolExpiryDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date when the license pool expires (optional)'
      },
      status: {
        type: DataTypes.ENUM('active', 'expired', 'suspended'),
        defaultValue: 'active'
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'company',
          key: 'id'
        },
        comment: 'Company this license pool belongs to'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Additional notes about the license pool'
      },
      stripePaymentIntentId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Stripe payment intent ID for this purchase'
      },
      createdAt: {
        field: 'created_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: new Date()
      },
      updatedAt: {
        field: 'updated_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: new Date()
      }
    }, {
      sequelize,
      modelName: 'license_pools',
      tableName: 'license_pools',
      underscored: true,
      paranoid: true,
      indexes: [
        {
          fields: ['purchased_by']
        },
        {
          fields: ['status']
        },
        {
          fields: ['company_id']
        },
        {
          fields: ['license_type']
        }
      ]
    });
  }

  static associate(models) {
    // License pool belongs to a superuser who purchased it
    this.belongsTo(models.user, { 
      foreignKey: 'purchasedBy', 
      as: 'purchaser' 
    });
    
    // License pool belongs to a company
    this.belongsTo(models.company, { 
      foreignKey: 'companyId', 
      as: 'company' 
    });
    
    // License pool has many allocations
    this.hasMany(models.license_allocations, { 
      foreignKey: 'licensePoolId', 
      as: 'allocations' 
    });
    
    // Add hooks for cascading soft delete
    this.addHook('beforeDestroy', async (licensePool, options) => {
      const { transaction } = options;
      
      try {
        // Soft delete associated license allocations
        await models.license_allocations.destroy({
          where: { licensePoolId: licensePool.id },
          transaction
        });

        console.log(`Cascading soft delete completed for license pool: ${licensePool.id}`);
      } catch (error) {
        console.error(`Error in beforeDestroy hook for license pool ${licensePool.id}:`, error);
        throw error;
      }
    });
  }

  // Instance methods
  canAllocateLicense() {
    return this.status === 'active' && this.availableLicenses > 0;
  }

  async allocateLicense() {
    if (!this.canAllocateLicense()) {
      throw new Error('Cannot allocate license from this pool');
    }
    
    await this.increment('allocatedLicenses', { by: 1 });
    return this;
  }

  async deallocateLicense() {
    if (this.allocatedLicenses <= 0) {
      throw new Error('No licenses to deallocate');
    }
    
    await this.decrement('allocatedLicenses', { by: 1 });
    return this;
  }

  // Get utilization percentage
  getUtilizationPercentage() {
    if (this.totalLicenses === 0) return 0;
    return Math.round((this.allocatedLicenses / this.totalLicenses) * 100);
  }

  // Check if pool is expired
  isExpired() {
    if (!this.poolExpiryDate) return false;
    return new Date() > new Date(this.poolExpiryDate);
  }

  // Get remaining days until expiry
  getDaysUntilExpiry() {
    if (!this.poolExpiryDate) return null;
    const now = new Date();
    const expiry = new Date(this.poolExpiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

module.exports = LicensePool; 