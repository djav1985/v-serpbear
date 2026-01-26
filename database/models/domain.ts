import { Table, Model, Column, DataType, PrimaryKey, Unique } from 'sequelize-typescript';

@Table({
  timestamps: false,
  tableName: 'domain',
})

class Domain extends Model {
   @PrimaryKey
   @Column({ type: DataType.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true })
   ID!: number;

   @Unique
   @Column({ type: DataType.STRING, allowNull: false, defaultValue: '', unique: true })
   domain!: string;

   @Unique
   @Column({ type: DataType.STRING, allowNull: false, defaultValue: '', unique: true })
   slug!: string;

   @Column({ type: DataType.STRING, allowNull: true })
   lastUpdated!: string;

   @Column({ type: DataType.STRING, allowNull: true })
   added!: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify([]) })
   tags!: string;

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
   scrapeEnabled!: number;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 1 })
   notification!: number;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'daily' })
   notification_interval!: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: '' })
   notification_emails!: string;

   @Column({ type: DataType.STRING, allowNull: true })
   search_console!: string;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 0 })
   avgPosition!: number;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 0 })
   mapPackKeywords!: number;

   @Column({ type: DataType.TEXT, allowNull: true, defaultValue: null })
   scraper_settings!: string | null;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: null })
   business_name!: string | null;
}

export default Domain;
