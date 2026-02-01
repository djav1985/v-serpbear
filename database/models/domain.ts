import { Table, Model, Column, DataType, PrimaryKey, Unique } from 'sequelize-typescript';

@Table({
  timestamps: false,
  tableName: 'domain',
})

class Domain extends Model {
   @PrimaryKey
   @Column({ type: DataType.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true })
   declare ID: number;

   @Unique
   @Column({ type: DataType.STRING, allowNull: false, defaultValue: '', unique: true })
   declare domain: string;

   @Unique
   @Column({ type: DataType.STRING, allowNull: false, defaultValue: '', unique: true })
   declare slug: string;

   @Column({ type: DataType.STRING, allowNull: true })
   declare lastUpdated: string;

   @Column({ type: DataType.STRING, allowNull: true })
   declare added: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify([]) })
   declare tags: string;

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
   declare scrapeEnabled: number;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 1 })
   declare notification: number;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'daily' })
   declare notification_interval: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: '' })
   declare notification_emails: string;

   @Column({ type: DataType.STRING, allowNull: true })
   declare search_console: string;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 0 })
   declare avgPosition: number;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 0 })
   declare mapPackKeywords: number;

   @Column({ type: DataType.TEXT, allowNull: true, defaultValue: null })
   declare scraper_settings: string | null;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: null })
   declare business_name: string | null;
}

export default Domain;
