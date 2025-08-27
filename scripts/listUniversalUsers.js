const models = require('../App/models');

const listUniversalUsers = async () => {
  try {
    console.log('🔍 Listing all Universal Users...');
    console.log('=====================================\n');

    const universalUsers = await models.user.findAll({
      where: { 
        role: 'universal_user',
        deleted_at: null 
      },
      attributes: ['id', 'email', 'name', 'role', 'company_id', 'createdAt', 'updatedAt']
    });

    if (universalUsers.length === 0) {
      console.log('✅ No Universal Users found in the database');
    } else {
      console.log(`📊 Found ${universalUsers.length} Universal User(s):\n`);
      
      universalUsers.forEach((user, index) => {
        console.log(`${index + 1}. Universal User Details:`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Company ID: ${user.company_id || 'N/A (Universal)'}`);
        console.log(`   Created: ${user.createdAt}`);
        console.log(`   Updated: ${user.updatedAt}`);
        console.log('');
      });
    }

    // Also show total user count by role for context
    console.log('📈 User Statistics:');
    const userStats = await models.user.findAll({
      where: { deleted_at: null },
      attributes: [
        'role',
        [models.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['role'],
      raw: true
    });

    userStats.forEach(stat => {
      console.log(`   ${stat.role}: ${stat.count} users`);
    });

  } catch (error) {
    console.error('❌ Error listing Universal Users:', error);
  } finally {
    // Close database connection
    if (models.sequelize) {
      await models.sequelize.close();
    }
    process.exit(0);
  }
};

// Run if called directly
if (require.main === module) {
  listUniversalUsers();
}

module.exports = {
  listUniversalUsers
};
