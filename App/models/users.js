


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
	supervisor_id: {
        type: Sequelize.INTEGER,
        references: {         // users belongsTo Company 1:1
          model: 'users',
          key: 'id'
        }
	},
	company: {
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
	user_type: {
		type: Sequelize.ENUM,
		values: ['admin', 'user'],
		default: 'user',
	},
	profile_pic: {
		type: Sequelize.STRING,
		default: 'images/noimage.png',
	},
	createdAt: {
		field: 'created_at',
		type: Sequelize.DATE,
		allowNull: true
	},
	updatedAt: {
		field: 'updated_at',
		type: Sequelize.DATE,
		allowNull: true
	}
	});
    users.associate = function(models) {
		users.belongsTo(models.users, {foreignKey: 'supervisor_id', as: 'supervisor'})
		users.hasOne(models.users, {foreignKey: 'supervisor_id', as: 'user'})	
		users.hasOne(models.reset_passwords, {foreignKey: '_userId', as: 'log_user'})
	  };
	  return users;
  };
