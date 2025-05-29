const db = require("../App/models");
const sequelize = db.sequelize;

async function addCompanyColumn() {
  try {
    // First, add an index to the company column in the users table
    await sequelize.getQueryInterface().addIndex('users', ['company'], {
      name: 'users_company_idx'
    });
    console.log('Added index to company column in users table');

    // Then add the company column to asset_hierarchy
    await sequelize.getQueryInterface().addColumn('asset_hierarchy', 'company', {
      type: db.Sequelize.STRING(150),
      allowNull: true,
      references: {
        model: 'users',
        key: 'company'
      }
    });
    
    console.log('Successfully added company column to asset_hierarchy table');
    process.exit(0);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError' || 
        (error.original && error.original.errno === 1061)) {
      // Index already exists, proceed with adding the column
      try {
        await sequelize.getQueryInterface().addColumn('asset_hierarchy', 'company', {
          type: db.Sequelize.STRING(150),
          allowNull: true,
          references: {
            model: 'users',
            key: 'company'
          }
        });
        console.log('Successfully added company column to asset_hierarchy table');
        process.exit(0);
      } catch (columnError) {
        console.error('Error adding company column:', columnError);
        process.exit(1);
      }
    } else {
      console.error('Error in migration:', error);
      process.exit(1);
    }
  }
}

addCompanyColumn(); 