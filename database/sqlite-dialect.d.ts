import { EventEmitter } from 'events';

declare namespace SqliteDialect {
  type Callback<T = unknown> = (_error: Error | null, result?: T) => void;

  class Database extends EventEmitter {
    constructor(filename: string, mode?: number, callback?: Callback<void>);

    filename: string;

    open: boolean;

    run(_sql: string, params?: unknown[] | Record<string, unknown>, callback?: Callback<void>): this;

    all<T = unknown>(_sql: string, params?: unknown[] | Record<string, unknown>, callback?: Callback<T[]>): this;

    get<T = unknown>(_sql: string, params?: unknown[] | Record<string, unknown>, callback?: Callback<T | undefined>): this;

    exec(_sql: string, callback?: Callback<void>): this;

    close(_callback?: Callback<void>): this;

    serialize<T>(_callback: () => T): this;

    parallelize<T>(_callback: () => T): this;

    configure(_option: string, value: unknown): this;
  }

  interface Cached {
    objects: Record<string, Database>;
    Database(_file: string, mode?: number | Callback<void>, callback?: Callback<void>): Database;
  }
}

declare const sqlite: {
  Database: typeof SqliteDialect.Database;
  OPEN_READONLY: number;
  OPEN_READWRITE: number;
  OPEN_CREATE: number;
  cached: SqliteDialect.Cached;
  verbose(): typeof sqlite;
};

export = sqlite;
