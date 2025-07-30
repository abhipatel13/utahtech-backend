const models = require('../App/models');
const bcrypt = require('bcryptjs');

const setupUniversalUser = async () => {
  try {
    console.log('🚀 Setting up Universal User directly...');

    // Get the sequelize instance
    const sequelize = models.sequelize;

    // First, try to alter the users table to allow company_id to be nullable
    try {
      console.log('📝 Updating users table schema...');
      await sequelize.query(`
        ALTER TABLE users 
        MODIFY COLUMN company_id INT NULL
      `);
      console.log('✅ Successfully updated users table schema');
    } catch (error) {
      console.log('⚠️  Schema might already be updated:', error.message);
    }

    // Universal User credentials
    const universalUserData = {
      email: 'universal@utahtech.edu',
      password: 'UniversalAdmin2024!',
      role: 'universal_user',
      name: 'Universal Administrator',
      company_id: null, // Universal users don't belong to specific companies
      department: 'System Administration',
      business_unit: 'IT',
      plant: 'Central'
    };

    // Check if universal user already exists
    const existingUser = await models.user.findOne({
      where: { 
        email: universalUserData.email,
        deleted_at: null 
      }
    });

    if (existingUser) {
      console.log('⚠️  Universal user already exists:', existingUser.email);
      console.log('   Role:', existingUser.role);
      console.log('   Created:', existingUser.createdAt);
      
      // Update to universal_user role if needed
      if (existingUser.role !== 'universal_user') {
        await existingUser.update({ 
          role: 'universal_user',
          company_id: null 
        });
        console.log('✅ Updated existing user to universal_user role');
      }
      
      console.log('');
      console.log('🔐 Login Credentials:');
      console.log('   Email: universal@utahtech.edu');
      console.log('   Password: UniversalAdmin2024!');
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(universalUserData.password, 10);

    // Create the universal user directly with raw query to bypass model validations
    const result = await sequelize.query(`
      INSERT INTO users (
        name, email, company_id, password, department, role, 
        business_unit, plant, last_login, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, {
      replacements: [
        universalUserData.name,
        universalUserData.email,
        null, // company_id is explicitly null
        hashedPassword,
        universalUserData.department,
        universalUserData.role,
        universalUserData.business_unit,
        universalUserData.plant,
        new Date(0), // default last_login
        new Date(),
        new Date()
      ],
      type: sequelize.QueryTypes.INSERT
    });

    console.log('✅ Universal User created successfully!');
    console.log('   Email:', universalUserData.email);
    console.log('   Role:', universalUserData.role);
    console.log('   ID:', result[0]);
    console.log('');
    console.log('🔐 Login Credentials:');
    console.log('   Email: universal@utahtech.edu');
    console.log('   Password: UniversalAdmin2024!');
    console.log('');
    console.log('📋 Permissions:');
    console.log('   - Create users of any role (including other universal users)');
    console.log('   - Access all companies');
    console.log('   - Full system administration');
    console.log('   - Universal dashboard access');

  } catch (error) {
    console.error('❌ Error setting up universal user:', error);
    
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
    console.log('🏗️  Utah Tech Universal User Direct Setup');
    console.log('==========================================\n');

    await setupUniversalUser();

    console.log('\n🎉 Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Login with universal user credentials');
    console.log('3. Access the universal dashboard at /universal-dashboard');

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
  setupUniversalUser
}; 