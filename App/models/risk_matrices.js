module.exports = (sequelize, Sequelize) => {
	const risk_matrices = sequelize.define("risk_matrices", {
        user_id: {
        type: Sequelize.INTEGER,
        // references: {         // risk_matrices belongsTo Company 1:1
        //   model: 'users',
        //   key: 'id'
        // }
    },
    row_no : {
        type: Sequelize.INTEGER,
        allowNull : false  
    },
    col_no : {
        type: Sequelize.INTEGER,
        allowNull : false  
    },
    col_name : {
        type: Sequelize.STRING,
        allowNull : false  
    },
    col_desc : {
        type: Sequelize.STRING,
        allowNull : false  
    },
    row_name : {
        type: Sequelize.STRING,
        allowNull : false  
    },
    row_desc : {
        type: Sequelize.STRING,
        allowNull : false  
    },
    mat_val : {
        type: Sequelize.STRING,
        allowNull : false  
    },
    mat_color : {
        type: Sequelize.STRING,
        allowNull : false  
    },
    mat_type : {
		type: Sequelize.ENUM,
		values: ['personel', 'maintainance', 'revenue','process', 'environmental'],
		default: 'user',
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
  return risk_matrices;
};
