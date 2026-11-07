import { Sequelize } from 'sequelize-typescript';
import sqliteDialect from './sqlite-dialect';
import Domain from './models/domain';
import Keyword from './models/keyword';

const connection = new Sequelize({
   dialect: 'sqlite',
   // SQLite is a local file with no login, so the app's login credentials are deliberately not passed here
   host: '0.0.0.0',
   database: 'sequelize',
   dialectModule: sqliteDialect,
   pool: {
      max: 5,
      min: 0,
      idle: 10000,
   },
   logging: false,
   models: [Domain, Keyword],
   storage: './data/database.sqlite',
});

export default connection;
