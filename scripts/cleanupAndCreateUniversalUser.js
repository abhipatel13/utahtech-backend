const models = require('../App/models');
const bcrypt = require('bcryptjs');

const cleanupAndCreateUniversalUser = async () => {
  try {
    console.log('🧹 Starting cleanup and creation of Universal User...');
    console.log('=====================================\n');

    // Step 1: Remove all existing Universal Users
    console.log('🗑️  Removing all existing Universal Users...');
    
    const existingUniversalUsers = await models.user.findAll({
      where: { 
        role: 'universal_user',
        deleted_at: null 
      }
    });

    console.log(`   Found ${existingUniversalUsers.length} existing Universal User(s)`);

    if (existingUniversalUsers.length > 0) {
      // Soft delete all existing universal users
      for (const user of existingUniversalUsers) {
        await user.destroy();
        console.log(`   ❌ Removed Universal User: ${user.email}`);
      }
    } else {
      console.log('   ✅ No existing Universal Users found');
    }

    // Step 2: Create the new Universal User with utahtechservicesllc.com domain
    console.log('\n🚀 Creating new Universal User...');

    const universalUserData = {
      email: 'admin@utahtechservicesllc.com',
      password: 'UniversalAdmin2024!',
      role: 'universal_user',
      name: 'Utah Tech Services Administrator',
      company_id: null, // Universal users don't belong to specific companies
      department: 'System Administration',
      business_unit: 'IT Operations',
      plant: 'Central Office'
    };

    // Check if this specific email already exists (shouldn't, but safety check)
    const existingUser = await models.user.findOne({
      where: { 
        email: universalUserData.email,
        deleted_at: null 
      }
    });

    if (existingUser) {
      console.log('⚠️  User with email admin@utahtechservicesllc.com already exists');
      console.log('   Updating existing user to Universal User role...');
      
      // Update existing user
      const hashedPassword = await bcrypt.hash(universalUserData.password, 10);
      await existingUser.update({
        ...universalUserData,
        password: hashedPassword
      });
      
      console.log('✅ Updated existing user to Universal User');
    } else {
      // Hash the password
      const hashedPassword = await bcrypt.hash(universalUserData.password, 10);

      // Create the new universal user
      const universalUser = await models.user.create({
        ...universalUserData,
        password: hashedPassword
      });

      console.log('✅ New Universal User created successfully!');
    }

    console.log('\n📋 Universal User Details:');
    console.log('   Email: admin@utahtechservicesllc.com');
    console.log('   Password: UniversalAdmin2024!');
    console.log('   Role: universal_user');
    console.log('   Name: Utah Tech Services Administrator');
    console.log('   Domain: utahtechservicesllc.com');
    console.log('');
    console.log('🔐 Login Credentials:');
    console.log('   Email: admin@utahtechservicesllc.com');
    console.log('   Password: UniversalAdmin2024!');
    console.log('');
    console.log('📋 Permissions:');
    console.log('   - Create Superuser accounts only');
    console.log('   - Access all companies');
    console.log('   - Universal dashboard access');
    console.log('   - Manage users across all companies');

    // Step 3: Verify the result
    console.log('\n🔍 Verification...');
    const finalUniversalUsers = await models.user.findAll({
      where: { 
        role: 'universal_user',
        deleted_at: null 
      },
      attributes: ['id', 'email', 'name', 'role', 'createdAt']
    });

    console.log(`✅ Total Universal Users now: ${finalUniversalUsers.length}`);
    finalUniversalUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.name}) - Created: ${user.createdAt}`);
    });

  } catch (error) {
    console.error('❌ Error during cleanup and creation:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      console.log('   The email address is already in use.');
    } else if (error.name === 'SequelizeValidationError') {
      console.log('   Validation errors:');
      error.errors.forEach(err => {
        console.log(`     - ${err.path}: ${err.message}`);
      });
    }
  }
};

const main = async () => {
  try {
    console.log('🏗️  Utah Tech Services Universal User Cleanup & Setup');
    console.log('=====================================================\n');

    await cleanupAndCreateUniversalUser();

    console.log('\n🎉 Cleanup and setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Login with the new Universal User credentials');
    console.log('3. Access the universal portal at /universal-portal');

  } catch (error) {
    console.error('❌ Setup failed:', error);
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
  main();
}

module.exports = {
  cleanupAndCreateUniversalUser
};
