import { Sequelize } from 'sequelize';
import sqliteDialect from './sqlite-dialect';
import Domain from './models/domain';
import Keyword from './models/keyword';

const connection = new Sequelize({
   dialect: 'sqlite',
   host: '0.0.0.0',
   username: process.env.USER_NAME ? process.env.USER_NAME : process.env.USER,
   password: process.env.PASSWORD,
   database: 'sequelize',
   dialectModule: sqliteDialect,
   pool: {
      max: 5,
      min: 0,
      idle: 10000,
   },
   logging: false,
   storage: './data/database.sqlite',
});

Domain.initialize(connection);
Keyword.initialize(connection);

export default connection;
