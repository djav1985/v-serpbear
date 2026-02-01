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

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
   declare volume: number;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify([]) })
   declare url: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify([]) })
   declare tags: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: JSON.stringify([]) })
   declare lastResult: string;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 1 })
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
}

export default Keyword;
