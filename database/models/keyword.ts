import { Table, Model, Column, DataType, PrimaryKey, ForeignKey, BelongsTo } from 'sequelize-typescript';
import Domain from './domain';

@Table({
  timestamps: false,
  tableName: 'keyword',
})

class Keyword extends Model {
   @PrimaryKey
   @Column({ type: DataType.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true })
   ID!: number;

   @Column({ type: DataType.STRING, allowNull: false })
   keyword!: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'desktop' })
   device!: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'US' })
   country!: string;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: '' })
   location!: string;

   @ForeignKey(() => Domain)
   @Column({
      type: DataType.STRING,
      allowNull: false,
      defaultValue: '',
      references: { model: 'domain', key: 'domain' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
   })
   domain!: string;

   @BelongsTo(() => Domain, {
      foreignKey: 'domain',
      targetKey: 'domain',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
   })
   domainInfo?: Domain;

   @Column({ type: DataType.STRING, allowNull: true })
   lastUpdated!: string;

   @Column({ type: DataType.STRING, allowNull: true })
   added!: string;

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
   position!: number;

   @Column({ type: DataType.TEXT, allowNull: true, defaultValue: JSON.stringify({}) })
   history!: string;

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
   volume!: number;

   @Column({ type: DataType.TEXT, allowNull: true, defaultValue: JSON.stringify([]) })
   url!: string;

   @Column({ type: DataType.TEXT, allowNull: true, defaultValue: JSON.stringify([]) })
   tags!: string;

   @Column({ type: DataType.TEXT, allowNull: true, defaultValue: JSON.stringify([]) })
   lastResult!: string;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 1 })
   sticky!: number;

   @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: 0 })
   updating!: number;

   @Column({ type: DataType.STRING, allowNull: true })
   updatingStartedAt!: string | null;

   @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'false' })
   lastUpdateError!: string;

   @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
   mapPackTop3!: number;

   @Column({ type: DataType.TEXT, allowNull: true, defaultValue: JSON.stringify([]) })
   localResults!: string;
}

export default Keyword;
