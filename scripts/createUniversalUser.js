const models = require('../App/models');
const bcrypt = require('bcryptjs');

const createUniversalUser = async () => {
  try {
    console.log('🚀 Creating Universal User...');

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
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(universalUserData.password, 10);

    // Create the universal user
    const universalUser = await models.user.create({
      ...universalUserData,
      password: hashedPassword
    });

    console.log('✅ Universal User created successfully!');
    console.log('   Email:', universalUser.email);
    console.log('   Role:', universalUser.role);
    console.log('   ID:', universalUser.id);
    console.log('   Created:', universalUser.createdAt);
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
    console.error('❌ Error creating universal user:', error);
    
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

// Additional helper function to create a superuser with company
const createSuperUserForCompany = async (companyId, companyName) => {
  try {
    console.log(`\n🦸 Creating Superuser for ${companyName}...`);

    const superUserData = {
      email: `admin@${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
      password: 'SuperAdmin2024!',
      role: 'superuser',
      name: `${companyName} Administrator`,
      company_id: companyId,
      department: 'Administration',
      business_unit: 'Management',
      plant: 'Main'
    };

    // Check if superuser already exists
    const existingUser = await models.user.findOne({
      where: { 
        email: superUserData.email,
        deleted_at: null 
      }
    });

    if (existingUser) {
      console.log(`⚠️  Superuser for ${companyName} already exists:`, existingUser.email);
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(superUserData.password, 10);

    // Create the superuser
    const superUser = await models.user.create({
      ...superUserData,
      password: hashedPassword
    });

    console.log(`✅ Superuser for ${companyName} created successfully!`);
    console.log('   Email:', superUser.email);
    console.log('   Password: SuperAdmin2024!');
    console.log('   Role:', superUser.role);
    console.log('   Company ID:', superUser.company_id);

  } catch (error) {
    console.error(`❌ Error creating superuser for ${companyName}:`, error.message);
  }
};

const main = async () => {
  try {
    console.log('🏗️  Utah Tech Universal User Setup');
    console.log('=====================================\n');

    // Create the universal user
    await createUniversalUser();

    // Optionally create demo companies and superusers
    const createDemoData = process.argv.includes('--demo');
    
    if (createDemoData) {
      console.log('\n📦 Creating demo companies and superusers...');
      
      // Create demo companies if they don't exist
      const demoCompanies = [
        { name: 'Utah Tech Industries', id: null },
        { name: 'Tech Solutions Inc', id: null }
      ];

      for (let companyData of demoCompanies) {
        const existingCompany = await models.company.findOne({
          where: { name: companyData.name, deleted_at: null }
        });

        if (!existingCompany) {
          const newCompany = await models.company.create({
            name: companyData.name
          });
          companyData.id = newCompany.id;
          console.log(`✅ Created company: ${companyData.name} (ID: ${companyData.id})`);
        } else {
          companyData.id = existingCompany.id;
          console.log(`⚠️  Company already exists: ${companyData.name} (ID: ${companyData.id})`);
        }

        // Create superuser for this company
        await createSuperUserForCompany(companyData.id, companyData.name);
      }
    }

    console.log('\n🎉 Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Run the migration: npm run migrate');
    console.log('2. Start the server: npm start');
    console.log('3. Login with universal user credentials');
    console.log('4. Access the universal dashboard at /universal-dashboard');

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
  createUniversalUser,
  createSuperUserForCompany
}; 