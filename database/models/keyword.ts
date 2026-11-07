import { Table, Model, Column, DataType, PrimaryKey } from 'sequelize-typescript';

@Table({
  timestamps: false,
  tableName: 'keyword',
})

class Keyword extends Model {
   @PrimaryKey
   @Column({ type: DataType.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true })
   declare ID: number;

   @Column({ type: DataType.STRING, allowNull: false })
   declare keyword: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'desktop' })
   declare device: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'US' })
   declare country: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: '' })
   declare location: string;

   @Column({ type: DataType.STRING, allowNull: false, defaultValue: '' })
   declare domain: string;

   // @ForeignKey(() => Domain)
   // @Column({ allowNull: false })
   // declare domainID: number;

   // @BelongsTo(() => Domain)
   // declare domain: Domain;

   @Column({ type: DataType.STRING, allowNull: true })
   declare lastUpdated: string;

   @Column({ type: DataType.STRING, allowNull: true })
   declare added: string;

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
   declare position: number;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify({}) })
   declare history: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: null })
   declare history7d: string | null;

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
   declare volume: number;

   // The ranking URL; blank until a scrape finds the domain in the results
   @Column({ type: DataType.STRING, allowNull: true, defaultValue: '' })
   declare url: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify([]) })
   declare tags: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify([]) })
   declare lastResult: string;

   // 1 when the keyword is starred (a favourite); new keywords are not
   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 0 })
   declare sticky: number;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 0 })
   declare updating: number;

   @Column({ type: DataType.STRING, allowNull: true })
   declare updatingStartedAt: string | null;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'false' })
   declare lastUpdateError: string;

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
   declare mapPackTop3: number;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify([]) })
   declare localResults: string;

   // Day (YYYY-MM-DD) the keyword dropped out of the map pack top three; cleared when it returns or after 30 days
   @Column({ type: DataType.STRING, allowNull: true, defaultValue: null })
   declare mapPackRemovedAt: string | null;
}

export default Keyword;
