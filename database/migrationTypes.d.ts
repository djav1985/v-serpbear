import type { QueryInterface } from 'sequelize';

export type MigrationQueryInterface = QueryInterface;

/** Supports both Sequelize CLI's legacy arguments and Umzug's context object. */
export type MigrationParams = {
   context?: unknown;
   Sequelize?: unknown;
   sequelize?: unknown;
};
