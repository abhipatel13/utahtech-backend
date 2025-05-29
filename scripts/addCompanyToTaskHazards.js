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

    // Then add the company column to task_hazards
    await sequelize.getQueryInterface().addColumn('task_hazards', 'company', {
      type: db.Sequelize.STRING(150),
      allowNull: true,
      references: {
        model: 'users',
        key: 'company'
      }
    });
    
    console.log('Successfully added company column to task_hazards table');

    // Update existing records to set company based on the supervisor's company
    await sequelize.query(`
      UPDATE task_hazards th
      INNER JOIN users u ON th.supervisor = u.id
      SET th.company = u.company
      WHERE th.company IS NULL;
    `);
    console.log('Updated existing task_hazards with company information');

    process.exit(0);
  } catch (error) {
    console.error('Error in migration:', error);
    process.exit(1);
  }
}

addCompanyColumn(); 