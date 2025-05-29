const db = require("../App/models");
const sequelize = db.sequelize;

async function addCompanyColumn() {
  try {
    // First, add an index to the company column in the users table if it doesn't exist
    await sequelize.getQueryInterface().addIndex('users', ['company'], {
      name: 'users_company_idx'
    }).catch(error => {
      // Ignore error if index already exists
      if (error.original && error.original.errno !== 1061) {
        throw error;
      }
    });
    console.log('Ensured index exists on users.company');

    // Then add the company column to tactics
    await sequelize.getQueryInterface().addColumn('tactics', 'company', {
      type: db.Sequelize.STRING(150),
      allowNull: true,
      references: {
        model: 'users',
        key: 'company'
      }
    });
    
    console.log('Successfully added company column to tactics table');

    // Update existing records to set company based on the created_by user's company
    await sequelize.query(`
      UPDATE tactics t
      INNER JOIN users u ON t.created_by = u.id
      SET t.company = u.company
      WHERE t.company IS NULL;
    `);
    console.log('Updated existing tactics with company information');

    process.exit(0);
  } catch (error) {
    console.error('Error in migration:', error);
    process.exit(1);
  }
}

addCompanyColumn(); 