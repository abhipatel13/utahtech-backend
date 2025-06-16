const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'utahtech_db'
};

const createUsers = async () => {
    let connection;
    
    try {
        // Create connection to MySQL
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database:', dbConfig.database);

        // Set a company name, a role, and the number of users to create
        const company = 'Madeup Mining Co';
        // Roles: 'superuser', 'admin', 'supervisor', 'user'
        const role = 'user';
        // Number of users to create
        const count = 5;

        // Checks for existing users for a given company and sorts them by role   
        var foundUsers = await connection.execute(
            'SELECT id, email, role, supervisor_id FROM users WHERE company = ?', 
            [company]);

        var existingUsers = {};
        for (const user of foundUsers[0]) {
            (existingUsers[user.role] ? existingUsers[user.role].push(user) : existingUsers[user.role] = [user]);
        }
        // console.log('User groups', existingUsers);

        // Create users
        for(var i = 0; i < count; i++) {
            const email = `${role}${i + 1}@${company.replace(/\s+/g, '').toLowerCase()}.com`;
            const password = `${role}${i + 1}123`;
            const hashedPassword = bcrypt.hashSync(password, 10);
            const supervisor = role === 'user' && existingUsers['supervisor'] && existingUsers['supervisor'].length > 0 ? 
                existingUsers['supervisor'][Math.floor(Math.random() * existingUsers['supervisor'].length)].id : null;

            await connection.execute(
                'INSERT INTO users (email, password, role, company, supervisor_id) VALUES (?, ?, ?, ?, ?)',
                [email, hashedPassword, role, company, supervisor]
            );
            console.log(`User ${email} created successfully.`);

        }
        console.log('All users created successfully');

    } catch (error) {
        console.error('Error creating users:', error);
    } finally {
        if (connection) {
        await connection.end();
        }
    }
    process.exit(0);
}

createUsers();