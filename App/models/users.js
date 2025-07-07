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
          },
          unique: {
            args: true,
            msg: 'Email address already in use!'
          }
        },
        phone_no: {
          type: DataTypes.STRING,
        },
        company_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
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
        }
      },
      {
        sequelize,
        modelName: 'user',
        tableName: 'users',
        timestamps: true,
        underscored: true,
        paranoid: true
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
  };

  static scopes(models) {
    // Password is excluded by default, but can be included by using the 'auth' scope
    this.addScope('defaultScope', {
      attributes: ["id", "email", "name", "role", "company_id"],
      exclude: ['password'],
      include: [{ model: models.company, as: 'company', attributes: ["id", "name"]}]
    });
    this.addScope('basic', {
      attributes: ["id", "email", "name", "role"],
    });
    this.addScope('auth', {
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