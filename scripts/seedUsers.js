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
    email: 'superuser@example.com',
    password: 'superuser123',
    role: 'superuser',
    company: 'Utah Tech Services'
  },
  {
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin',
    company: 'Utah Tech Services'
  },
  {
    email: 'supervisor@example.com',
    password: 'supervisor123',
    role: 'supervisor',
    company: 'Utah Tech Services'
  },
  {
    email: 'user@example.com',
    password: 'user123',
    role: 'user',
    company: 'Utah Tech Services'
  }
];

const seedUsers = async () => {
  let connection;
  
  try {
    // Create connection to MySQL
    connection = await mysql.createConnection(dbConfig);

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
          company VARCHAR(255)
        )
      `);
      console.log('Users table created');
    } else {
      console.log('Users table already exists');
    }

    // Clear existing users
    await connection.execute('DELETE FROM users');
    console.log('Cleared existing users');

    // Create new users
    for (const userData of users) {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      // Insert user
      await connection.execute(
        'INSERT INTO users (email, password, role, company) VALUES (?, ?, ?, ?)',
        [userData.email, hashedPassword, userData.role, userData.company]
      );
      
      console.log(`Created user: ${userData.email} with role: ${userData.role} and company: ${userData.company}`);
    }

    console.log('All users created successfully');
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