const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'utahtech_db'
};

class User {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.password = data.password;
    this.role = data.role;
    this.company = data.company;
  }

  // Find user by ID
  static async findById(id) {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      
      if (rows.length === 0) return null;
      return new User(rows[0]);
    } finally {
      await connection.end();
    }
  }

  // Find user by email
  static async findByEmail(email) {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
      
      if (rows.length === 0) return null;
      return new User(rows[0]);
    } finally {
      await connection.end();
    }
  }

  // Create a new user
  static async create(userData) {
    const connection = await mysql.createConnection(dbConfig);
    try {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      const [result] = await connection.execute(
        'INSERT INTO users (email, password, role, company) VALUES (?, ?, ?, ?)',
        [userData.email, hashedPassword, userData.role || 'user', userData.company || null]
      );
      
      return this.findById(result.insertId);
    } finally {
      await connection.end();
    }
  }

  // Convert user to JSON (excluding sensitive data)
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      company: this.company
    };
  }

  // Update last login
  async updateLastLogin() {
    // No last_login field in the database, so we'll just return the user
    return this;
  }

  // Compare password
  async comparePassword(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  }

  // Get user permissions based on role
  getPermissions() {
    const rolePermissions = {
      superuser: ['all_access'],
      admin: [
        'account_creation', 
        'licensing_management', 
        'asset_hierarchy'
      ],
      supervisor: [
        'risk_assessment',
        'safety_management',
        'analytics_reporting'
      ],
      user: [
        'risk_assessment_creation'
      ]
    };
    
    return rolePermissions[this.role] || [];
  }
}

module.exports = User; 