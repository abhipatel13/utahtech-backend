const { Sequelize } = require('sequelize');
const bcrypt = require('bcryptjs');

class Users extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init(
      {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: DataTypes.INTEGER
        },
        name: {
          type: DataTypes.STRING(150)
        },
        email: {
          type: DataTypes.STRING,
          allowNull: false,
          validate: {
            isEmail:true
          }
        },
        phone_no: {
          type: DataTypes.STRING,
        },
        company_id: {
          type: DataTypes.INTEGER,
          allowNull: true, // Allow null for universal_user role
          references: {
            model: 'company',
            key: 'id'
          }
        },
        supervisor_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          }
        },
        password: {
          type: DataTypes.STRING,
          default: '',
        },
        department: {
          type: DataTypes.STRING(150)
        },
        role: {
          type: DataTypes.STRING(150)
        },
        business_unit: {
          type: DataTypes.STRING(150)
        },
        plant: {
          type: DataTypes.STRING(150)
        },
        profile_pic: {
          type: DataTypes.STRING,
          default: 'images/noimage.png',
        },
        last_login: {
          type: DataTypes.DATE,
          defaultValue: new Date(0),
        },
        email_verified: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false
        },
        email_verification_token: {
          type: DataTypes.STRING,
          allowNull: true
        }
      },
      {
        sequelize,
        modelName: 'user',
        tableName: 'users',
        timestamps: true,
        underscored: true,
        paranoid: true,
        indexes: [
          {
            fields: ['email']
          },
          {
            fields: ['company_id']
          },
          {
            fields: ['email','deleted_at'],
            unique: true,
            name: 'unique_active_email'
          }
        ]
      }
    );
  };

  static associate(models) {
    this.uploadAssociation = models.user.hasMany(models.file_uploads);
    this.resetPassAssociation = models.user.hasMany(models.reset_passwords, {
      foreignKey: 'user_id',
      as: 'reset_passwords'
    });	
    this.subordinateAssociation = models.user.hasMany(models.user, {
      foreignKey: 'supervisor_id',
      as: 'subordinate'
    });
    this.supervisorAssociation = models.user.belongsTo(models.user, {
      foreignKey: 'supervisor_id',
      as: 'supervisor'
    });
    // Payment association removed - payment management functionality deprecated
    this.companyAssociation = models.user.belongsTo(models.company, {
      foreignKey: 'company_id',
      as: 'company'
    });
    this.hasMany(models.task_hazards, { foreignKey: 'supervisorId' });
    
    // Many-to-many relationship with task hazards for multiple individuals
    this.belongsToMany(models.task_hazards, {
      through: models.task_hazard_individuals,
      foreignKey: 'userId',
      otherKey: 'taskHazardId',
      as: 'assignedTaskHazards'
    });
    
    // Many-to-many relationship with risk assessments for multiple individuals
    this.belongsToMany(models.risk_assessments, {
      through: models.risk_assessment_individuals,
      foreignKey: 'userId',
      otherKey: 'riskAssessmentId',
      as: 'assignedRiskAssessments'
    });
  };

  static scopes(models) {
    // Password is excluded by default, but can be included by using the 'auth' scope
    this.addScope('defaultScope', {
      attributes: ["id", "email", "name", "role", "company_id"],
      exclude: ['password'],
      include: [{ model: models.company, as: 'company', attributes: ["id", "name"]}]
    });
    this.addScope('basic', {
      attributes: ["id", "email", "name", "role", "department", "phone_no"],
    });
    this.addScope('auth', {
        attributes: { include: ['password', 'email_verified', 'email_verification_token'] },
        include: [{ model: models.company, as: 'company' }]
    });
  }

  // The below methods are replacements for User class methods
  async comparePassword(candidatePassword) {
    if (this.password === undefined) {
      throw new Error('Password not in scope');
    }
    return bcrypt.compare(candidatePassword, this.password);
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      company: this.company
    };
  }

  // Get user permissions based on role
  getPermissions() {
    const rolePermissions = {
      universal_user: [
        'all_access',
        'universal_management',
        'create_superusers',
        'manage_all_companies',
        'system_administration'
      ],
      superuser: ['all_access'],
      admin: ['all_access'],
      supervisor: [
        'risk_assessment',
        'safety_management',
        'analytics_reporting',
        'view_tactics',
        'create_tactics',
        'edit_tactics',
        'delete_tactics'
      ],
      user: [
        'risk_assessment_creation',
        'view_asset_hierarchy',
        'view_tactics'
      ]
    };
    
    return rolePermissions[this.role] || [];
  }

  // Check if user is universal_user
  isUniversalUser() {
    return this.role === 'universal_user';
  }

  // Check if user has access to specific company
  hasCompanyAccess(companyId) {
    // Universal users have access to all companies
    if (this.isUniversalUser()) {
      return true;
    }
    // Other users can only access their own company
    return this.company_id === companyId;
  }

  async updateLastLogin() {
    this.last_login = new Date();
    await this.save();
    return this;
  }
}

module.exports = Users;





// const { Sequelize } = require('sequelize');

// class CLASSNAME extends Sequelize.Model {
//   static init(sequelize, DataTypes) {
//     return super.init(
//       {
        
//       },
//       {
//         sequelize,
//         modelName: 'user',
//         tableName: 'users',
//         timestamps: true,
//         underscored: true,
//         paranoid: true
//       }
//     );
//   };

//   static associate(models) {
//   };
// }

// module.exports = CLASSNAME;