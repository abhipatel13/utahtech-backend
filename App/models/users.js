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
        is_deleted: {
          type: DataTypes.ENUM,
          values: ['0', '1'], // 1 -> Deleted 0-> Exist
          default: '0',
        },
        profile_pic: {
          type: DataTypes.STRING,
          default: 'images/noimage.png',
        }
      },
      {
        // Password is excluded by default, but can be included by using the 'auth' scope
        defaultScope: {
          attributes: {
            exclude: ['password']
          }
        },
        scopes: {
          auth: {
            exclude: []
          }
        },
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
    this.uploadAssociation = models.users.hasMany(models.file_uploads);
    this.resetPassAssociation = models.users.hasMany(models.reset_passwords, {
      foreignKey: 'user_id',
      as: 'reset_passwords'
    });	
    this.subordinateAssociation = models.users.hasMany(models.users, {
      foreignKey: 'supervisor_id',
      as: 'subordinate'
    });
    this.supervisorAssociation = models.users.belongsTo(models.users, {
      foreignKey: 'supervisor_id',
      as: 'supervisor'
    });
    this.paymentsAssociation = models.users.hasMany(models.payments, {foreignKey: 'userId', as: 'payments'})
  };

  // The below methods are replacements for User class methods
  async comparePassword(candidatePassword) {
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

  // async updateLastLogin() {
  //   // No last_login field in the database, so we'll just return the user
  //   return this;
  // }
}

module.exports = Users;

