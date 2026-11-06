const path = require('path');

const dialectModulePath = path.resolve(__dirname, 'sqlite-dialect.js');

module.exports = {
  production: {
    username: process.env.USER_NAME ? process.env.USER_NAME : process.env.USER,
    password: process.env.PASSWORD,
    database: 'sequelize',
    dialect: 'sqlite',
    storage: './data/database.sqlite',
    dialectModulePath,
    dialectOptions: {
      bigNumberStrings: true
    }
  }
};
