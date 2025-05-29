require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'Info-UTS125689',
    database: process.env.DB_NAME || 'utahtechservicesllc',
    host: process.env.DB_HOST || 'utahtechservicesllc.clie0cm66vk1.us-east-2.rds.amazonaws.com',
    dialect: 'mysql'
  },
  test: {
    username: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'Info-UTS125689',
    database: process.env.DB_NAME || 'utahtechservicesllc',
    host: process.env.DB_HOST || 'utahtechservicesllc.clie0cm66vk1.us-east-2.rds.amazonaws.com',
    dialect: 'mysql'
  },
  production: {
    username: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'Info-UTS125689',
    database: process.env.DB_NAME || 'utahtechservicesllc',
    host: process.env.DB_HOST || 'utahtechservicesllc.clie0cm66vk1.us-east-2.rds.amazonaws.com',
    dialect: 'mysql'
  }
}; 