const models = require('./App/models');

async function setupLicenseTables() {
  try {
    console.log('Setting up license tables...');
    
    // Force sync the models to create tables
    await models.sequelize.sync({ force: false, alter: true });
    console.log('✅ License tables created successfully');
    
    // Check if we need to create a sample license pool
    const poolCount = await models.license_pools.count();
    if (poolCount === 0) {
      console.log('Creating sample license pool...');
      
      // Find a superuser
      const superuser = await models.user.findOne({
        where: { role: 'superuser' }
      });
      
      if (superuser) {
        await models.license_pools.create({
          poolName: 'Test License Pool',
          purchasedBy: superuser.id,
          totalLicenses: 10,
          licenseType: 'monthly',
          validityPeriodMonths: 1,
          totalAmount: 100.00,
          pricePerLicense: 10.00,
          status: 'active',
          notes: 'Sample license pool for testing'
        });
        console.log('✅ Sample license pool created');
      } else {
        console.log('⚠️ No superuser found. Please create a superuser first.');
      }
    }
    
    console.log('✅ License system setup complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error setting up license tables:', error);
    process.exit(1);
  }
}

setupLicenseTables(); 