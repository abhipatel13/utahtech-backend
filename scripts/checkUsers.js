const mysql = require('mysql2/promise');
require('dotenv').config();

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'utahtech_db'
};

const checkUsers = async () => {
  let connection;
  
  try {
    // Create connection to MySQL
    connection = await mysql.createConnection(dbConfig);

    // Check if users table exists
    const [tables] = await connection.execute('SHOW TABLES');

    // Check users table structure
    try {
      const [columns] = await connection.execute('DESCRIBE users');
      console.log('Users table structure:', columns);
    } catch (error) {
      console.error('Error describing users table:', error.message);
    }

    // Check users in the table
    try {
      const [users] = await connection.execute('SELECT id, email, role, company FROM users');
      console.log('Users in database:', users);
    } catch (error) {
      console.error('Error selecting users:', error.message);
    }
  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    // Close connection
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
  
  process.exit(0);
};

checkUsers(); 