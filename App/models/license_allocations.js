const { Sequelize } = require('sequelize');

class LicenseAllocation extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER
      },
      licensePoolId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'license_pools',
          key: 'id'
        },
        comment: 'Reference to the license pool'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'User to whom the license is allocated'
      },
      allocatedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'Admin/Superuser who allocated the license'
      },
      allocationDate: {
        type: DataTypes.DATE,
        defaultValue: new Date(),
        allowNull: false,
        comment: 'Date when the license was allocated'
      },
      activationDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date when the user activated the license'
      },
      validFrom: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Start date of license validity'
      },
      validUntil: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'End date of license validity'
      },
      status: {
        type: DataTypes.ENUM('allocated', 'active', 'expired', 'revoked', 'suspended'),
        defaultValue: 'allocated',
        comment: 'Current status of the license allocation'
      },
      autoRenew: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether to automatically renew this license'
      },
      renewalAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Number of renewal attempts made'
      },
      lastRenewalDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date of last renewal'
      },
      usageMetrics: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Usage statistics and metrics for this license'
      },
      features: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Specific features enabled for this license allocation'
      },
      restrictions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Any restrictions applied to this license'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Additional notes about this allocation'
      },
      revokedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date when the license was revoked'
      },
      revokedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'User who revoked the license'
      },
      revokedReason: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Reason for license revocation'
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'company',
          key: 'id'
        },
        comment: 'Company this allocation belongs to'
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
      modelName: 'license_allocations',
      tableName: 'license_allocations',
      underscored: true,
      paranoid: true,
      indexes: [
        {
          fields: ['license_pool_id']
        },
        {
          fields: ['user_id']
        },
        {
          fields: ['status']
        },
        {
          fields: ['valid_until']
        },
        {
          fields: ['company_id']
        },
        {
          unique: true,
          fields: ['license_pool_id', 'user_id'],
          name: 'unique_pool_user_allocation'
        }
      ]
    });
  }

  static associate(models) {
    // License allocation belongs to a license pool
    this.belongsTo(models.license_pools, { 
      foreignKey: 'licensePoolId', 
      as: 'licensePool' 
    });
    
    // License allocation belongs to a user
    this.belongsTo(models.user, { 
      foreignKey: 'userId', 
      as: 'user' 
    });
    
    // License allocation was created by an admin/superuser
    this.belongsTo(models.user, { 
      foreignKey: 'allocatedBy', 
      as: 'allocator' 
    });
    
    // License allocation may be revoked by an admin/superuser
    this.belongsTo(models.user, { 
      foreignKey: 'revokedBy', 
      as: 'revoker' 
    });
    
    // License allocation belongs to a company
    this.belongsTo(models.company, { 
      foreignKey: 'companyId', 
      as: 'company' 
    });
  }

  // Instance methods
  isActive() {
    const now = new Date();
    return this.status === 'active' && 
           new Date(this.validFrom) <= now && 
           new Date(this.validUntil) > now;
  }

  isExpired() {
    return new Date() > new Date(this.validUntil) || this.status === 'expired';
  }

  isRevoked() {
    return this.status === 'revoked';
  }

  canActivate() {
    return this.status === 'allocated' && 
           new Date() >= new Date(this.validFrom) && 
           new Date() < new Date(this.validUntil);
  }

  async activate() {
    if (!this.canActivate()) {
      throw new Error('License cannot be activated at this time');
    }
    
    await this.update({
      status: 'active',
      activationDate: new Date()
    });
    
    return this;
  }

  async revoke(revokedBy, reason = null) {
    await this.update({
      status: 'revoked',
      revokedDate: new Date(),
      revokedBy: revokedBy,
      revokedReason: reason
    });
    
    // Update the license pool to decrease allocated count
    const licensePool = await this.getLicensePool();
    if (licensePool) {
      await licensePool.deallocateLicense();
    }
    
    return this;
  }

  async extend(additionalMonths) {
    const currentValidUntil = new Date(this.validUntil);
    currentValidUntil.setMonth(currentValidUntil.getMonth() + additionalMonths);
    
    await this.update({
      validUntil: currentValidUntil,
      lastRenewalDate: new Date(),
      renewalAttempts: this.renewalAttempts + 1
    });
    
    return this;
  }

  getDaysRemaining() {
    const now = new Date();
    const validUntil = new Date(this.validUntil);
    const diffTime = validUntil.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Check if license is expiring soon (within 7 days)
  isExpiringSoon(daysThreshold = 7) {
    const daysRemaining = this.getDaysRemaining();
    return daysRemaining > 0 && daysRemaining <= daysThreshold;
  }

  // Update usage metrics
  async updateUsageMetrics(metrics) {
    const currentMetrics = this.usageMetrics || {};
    const updatedMetrics = { ...currentMetrics, ...metrics };
    
    await this.update({
      usageMetrics: updatedMetrics
    });
    
    return this;
  }

  // Get usage statistics
  getUsageStats() {
    return this.usageMetrics || {};
  }

  // Check if license has specific feature enabled
  hasFeature(featureName) {
    if (!this.features) return false;
    return this.features.includes(featureName);
  }

  // Check if license has any restrictions
  hasRestrictions() {
    return this.restrictions && Object.keys(this.restrictions).length > 0;
  }
}

module.exports = LicenseAllocation; 