module.exports = (sequelize, Sequelize) => {
	const users = sequelize.define("users", {
		id: {
			allowNull: false,
			autoIncrement: true,
			primaryKey: true,
			type: Sequelize.INTEGER
		},
	  name: {
      type: Sequelize.STRING(150),
      allowNull: false
	  },
	  email: {
      type: Sequelize.STRING,
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
		  type: Sequelize.STRING,
	  },
    company_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'company',
        key: 'id'
      }
    },
    supervisor_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
	  password: {
      type: Sequelize.STRING,
      default: '',
    },
    department: {
      type: Sequelize.STRING(150)
    },
    role: {
      type: Sequelize.STRING(150)
    },
    business_unit: {
      type: Sequelize.STRING(150)
    },
    plant: {
      type: Sequelize.STRING(150)
    },
    is_deleted: {
      type: Sequelize.ENUM,
      values: ['0', '1'], // 1 -> Deleted 0-> Exist
      default: '0',
    },
    // UNUSED: Currently same as role
    // userType: {
    //   type: Sequelize.ENUM,
    //   values: ['admin', 'user'],
    //   default: 'user',
    // },
    profile_pic: {
      type: Sequelize.STRING,
      default: 'images/noimage.png',
    }
	}, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    paranoid: true
  });

  // Define self-referential associations
  users.hasMany(users, {
    foreignKey: 'supervisor_id',
    as: 'subordinate'
  });
  users.belongsTo(users, {
    foreignKey: 'supervisor_id',
    as: 'supervisor'
  });

  users.associate = function(models) {
    users.hasMany(models.file_uploads);
    users.hasMany(models.reset_passwords, {
      foreignKey: 'user_id',
      as: 'reset_passwords'
    });	
    users.hasMany(models.payments, {foreignKey: 'userId', as: 'payments'})
  };

  return users;
};
