import {
   CreationOptional,
   DataTypes,
   InferAttributes,
   InferCreationAttributes,
   Model,
   Sequelize,
} from 'sequelize';

class Domain extends Model<InferAttributes<Domain>, InferCreationAttributes<Domain>> {
   declare ID: CreationOptional<number>;

   declare domain: string;

   declare slug: string;

   declare lastUpdated: CreationOptional<string | null>;

   declare added: CreationOptional<string | null>;

   declare tags: CreationOptional<string>;

   declare scrapeEnabled: CreationOptional<boolean>;

   declare notification: CreationOptional<boolean | null>;

   declare notification_interval: CreationOptional<string | null>;

   declare notification_emails: CreationOptional<string | null>;

   declare search_console: CreationOptional<string | null>;

   declare avgPosition: CreationOptional<number | null>;

   declare mapPackKeywords: CreationOptional<number | null>;

   declare scraper_settings: CreationOptional<string | null>;

   static initialize(sequelize: Sequelize): typeof Domain {
      if (!sequelize.models.Domain) {
         Domain.init(
            {
               ID: {
                  type: DataTypes.INTEGER,
                  allowNull: false,
                  primaryKey: true,
                  autoIncrement: true,
               },
               domain: {
                  type: DataTypes.STRING,
                  allowNull: false,
                  unique: true,
                  defaultValue: '',
               },
               slug: {
                  type: DataTypes.STRING,
                  allowNull: false,
                  unique: true,
                  defaultValue: '',
               },
               lastUpdated: {
                  type: DataTypes.STRING,
                  allowNull: true,
               },
               added: {
                  type: DataTypes.STRING,
                  allowNull: true,
               },
               tags: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               scrapeEnabled: {
                  type: DataTypes.BOOLEAN,
                  allowNull: false,
                  defaultValue: true,
               },
               notification: {
                  type: DataTypes.BOOLEAN,
                  allowNull: true,
                  defaultValue: true,
               },
               notification_interval: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: 'daily',
               },
               notification_emails: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: '',
               },
               search_console: {
                  type: DataTypes.STRING,
                  allowNull: true,
               },
               avgPosition: {
                  type: DataTypes.INTEGER,
                  allowNull: true,
                  defaultValue: 0,
               },
               mapPackKeywords: {
                  type: DataTypes.INTEGER,
                  allowNull: true,
                  defaultValue: 0,
               },
               scraper_settings: {
                  type: DataTypes.TEXT,
                  allowNull: true,
                  defaultValue: null,
               },
            },
            {
               sequelize,
               tableName: 'domain',
               modelName: 'Domain',
               timestamps: false,
            },
         );
      }

      return Domain;
   }
}

export default Domain;
