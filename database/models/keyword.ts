import {
   CreationOptional,
   DataTypes,
   InferAttributes,
   InferCreationAttributes,
   Model,
   Sequelize,
} from 'sequelize';

class Keyword extends Model<InferAttributes<Keyword>, InferCreationAttributes<Keyword>> {
   declare ID: CreationOptional<number>;

   declare keyword: string;

   declare device: CreationOptional<string>;

   declare country: CreationOptional<string>;

   declare location: CreationOptional<string>;

   declare domain: string;

   declare lastUpdated: CreationOptional<string | null>;

   declare added: CreationOptional<string | null>;

   declare position: CreationOptional<number>;

   declare history: CreationOptional<string>;

   declare volume: CreationOptional<number>;

   declare url: CreationOptional<string>;

   declare tags: CreationOptional<string>;

   declare lastResult: CreationOptional<string>;

   declare sticky: CreationOptional<boolean | null>;

   declare updating: CreationOptional<boolean | null>;

   declare lastUpdateError: CreationOptional<string | null>;

   declare mapPackTop3: CreationOptional<boolean>;

   static initialize(sequelize: Sequelize): typeof Keyword {
      if (!sequelize.models.Keyword) {
         Keyword.init(
            {
               ID: {
                  type: DataTypes.INTEGER,
                  allowNull: false,
                  primaryKey: true,
                  autoIncrement: true,
               },
               keyword: {
                  type: DataTypes.STRING,
                  allowNull: false,
               },
               device: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: 'desktop',
               },
               country: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: 'US',
               },
               location: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: '',
               },
               domain: {
                  type: DataTypes.STRING,
                  allowNull: false,
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
               position: {
                  type: DataTypes.INTEGER,
                  allowNull: false,
                  defaultValue: 0,
               },
               history: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify({}),
               },
               volume: {
                  type: DataTypes.INTEGER,
                  allowNull: false,
                  defaultValue: 0,
               },
               url: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               tags: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               lastResult: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               sticky: {
                  type: DataTypes.BOOLEAN,
                  allowNull: true,
                  defaultValue: true,
               },
               updating: {
                  type: DataTypes.BOOLEAN,
                  allowNull: true,
                  defaultValue: false,
               },
               lastUpdateError: {
                  type: DataTypes.STRING,
                  allowNull: true,
                  defaultValue: 'false',
               },
               mapPackTop3: {
                  type: DataTypes.BOOLEAN,
                  allowNull: false,
                  defaultValue: false,
               },
            },
            {
               sequelize,
               tableName: 'keyword',
               modelName: 'Keyword',
               timestamps: false,
            },
         );
      }

      return Keyword;
   }
}

export default Keyword;
