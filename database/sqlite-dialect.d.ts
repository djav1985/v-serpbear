import { EventEmitter } from 'events';

declare namespace SqliteDialect {
  interface RunResult {
    lastID: number;
    changes: number;
  }

  type Callback<T = unknown> = (error: Error | null, result?: T) => void;
  type RunCallback = (this: RunResult, error: Error | null) => void;
  type AllCallback<T> = (error: Error | null, rows: T[]) => void;
  type GetCallback<T> = (error: Error | null, row: T | undefined) => void;

  class Database extends EventEmitter {
    constructor(filename: string, mode?: number, callback?: Callback<void>);

    filename: string;

    open: boolean;

    /** Underlying better-sqlite3 driver instance */
    driver: {
      prepare(sql: string, ...args: unknown[]): unknown;
      [key: string]: unknown;
    };

    run(sql: string, callback?: RunCallback): this;
    run(sql: string, params: unknown, callback?: RunCallback): this;
    run(sql: string, param1: unknown, param2: unknown, callback?: RunCallback): this;

    all<T = unknown>(sql: string, callback?: AllCallback<T>): this;
    all<T = unknown>(sql: string, params: unknown, callback?: AllCallback<T>): this;
    all<T = unknown>(sql: string, param1: unknown, param2: unknown, callback?: AllCallback<T>): this;

    get<T = unknown>(sql: string, callback?: GetCallback<T>): this;
    get<T = unknown>(sql: string, params: unknown, callback?: GetCallback<T>): this;
    get<T = unknown>(sql: string, param1: unknown, param2: unknown, callback?: GetCallback<T>): this;

    exec(sql: string, callback?: Callback<void>): this;

    close(callback?: Callback<void>): this;

    serialize<T>(callback: () => T): this;

    parallelize<T>(callback: () => T): this;

    configure(option: string, value: unknown): this;
  }

  interface Cached {
    objects: Record<string, Database>;
    Database(file: string, mode?: number | Callback<void>, callback?: Callback<void>): Database;
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
