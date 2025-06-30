const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'utahtech_db'
};

// Test users with different roles
const users = [
  {
    email: 'hello1@utahtechnicalservicesllc.com',
    password: 'superuser123',
    role: 'superuser'
  },
  {
    email: 'superuser@utahtechnicalservicesllc.com',
    password: 'superuser123',
    role: 'superuser'
  },
  {
    email: 'admin@utahtechnicalservicesllc.com',
    password: 'admin123',
    role: 'admin'
  },
  {
    email: 'supervisor@utahtechnicalservicesllc.com',
    password: 'supervisor123',
    role: 'supervisor'
  },
  {
    email: 'user@utahtechnicalservicesllc.com',
    password: 'user123',
    role: 'user'
  },
  {
    email: 'newsuperuser@utahtechnicalservicesllc.com',
    password: 'newsuperuser123',
    role: 'superuser'
  }
];

const seedUsers = async () => {
  let connection;
  
  try {
    // Create connection to MySQL
    connection = await mysql.createConnection(dbConfig);

    // Check if company table exists, create if it doesn't
    const [companyTables] = await connection.execute('SHOW TABLES LIKE "company"');
    if (companyTables.length === 0) {
      console.log('Company table does not exist. Creating it...');
      await connection.execute(`
        CREATE TABLE company (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP NULL
        )
      `);
      console.log('Company table created');
    }

    // Check if Utah Technical Services company exists, create if it doesn't
    const [existingCompany] = await connection.execute(
      'SELECT id FROM company WHERE name = ?',
      ['Utah Technical Services LLC']
    );

    let companyId;
    if (existingCompany.length === 0) {
      const [companyResult] = await connection.execute(
        'INSERT INTO company (name) VALUES (?)',
        ['Utah Technical Services LLC']
      );
      companyId = companyResult.insertId;
      console.log('Created company: Utah Technical Services LLC with ID:', companyId);
    } else {
      companyId = existingCompany[0].id;
      console.log('Company Utah Technical Services LLC already exists with ID:', companyId);
    }

    // Check if users table exists
    const [tables] = await connection.execute('SHOW TABLES LIKE "users"');
    if (tables.length === 0) {
      console.log('Users table does not exist. Creating it...');
      // Create users table with the simplified structure
      await connection.execute(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL,
          company_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP NULL,
          FOREIGN KEY (company_id) REFERENCES company(id)
        )
      `);
      console.log('Users table created');
    } else {
      console.log('Users table already exists');
    }

    // Instead of deleting all users, we'll check if each user exists before inserting
    for (const userData of users) {
      // Check if user already exists
      const [existingUsers] = await connection.execute(
        'SELECT id FROM users WHERE email = ?',
        [userData.email]
      );

      if (existingUsers.length === 0) {
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userData.password, salt);
        
        // Insert user
        await connection.execute(
          'INSERT INTO users (email, password, role, company_id) VALUES (?, ?, ?, ?)',
          [userData.email, hashedPassword, userData.role, companyId]
        );
        
        console.log(`Created user: ${userData.email} with role: ${userData.role} and company_id: ${companyId}`);
      } else {
        console.log(`User ${userData.email} already exists, skipping...`);
      }
    }

    console.log('User seeding completed');
  } catch (error) {
    console.error('Error seeding users:', error);
  } finally {
    // Close connection
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
  
  process.exit(0);
};

seedUsers(); 