/** @jest-environment node */

import { ensureDatabase, initializeDatabase, isDatabaseInitialized, resetDatabaseInitialization } from '../../database/init';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import sqlite from '../../database/sqlite-dialect';
import { fromDbBool, normalizeToBoolean, parseBooleanStrict, parseEnvFlag, toDbBool } from '../../utils/dbBooleans';

jest.mock('../../database/database', () => ({
   __esModule: true,
   default: {
      sync: jest.fn(),
      query: jest.fn(),
   },
}));
jest.mock('../../database/models/keyword', () => ({
   __esModule: true,
   default: {
      update: jest.fn(),
   },
}));
jest.mock('../../utils/logger', () => ({
   logger: {
      info: jest.fn(),
      error: jest.fn(),
   },
}));

describe('init', () => {
  /**
   * Tests for database initialization module
   */


  describe('Database Initialization', () => {
     beforeEach(() => {
        jest.clearAllMocks();
        resetDatabaseInitialization();
        (Keyword.update as jest.Mock).mockResolvedValue([0]);
     });

     it('should initialize database on first call and create the keyword indexes after sync', async () => {
        (db.sync as jest.Mock).mockResolvedValue(undefined);
        (db.query as jest.Mock).mockResolvedValue([undefined, 0]);

        await initializeDatabase();

        expect(db.sync).toHaveBeenCalledTimes(1);
        expect(db.query).toHaveBeenCalledWith(
           "CREATE UNIQUE INDEX IF NOT EXISTS keyword_tracking_target_idx ON keyword (domain, keyword, COALESCE(country, ''), COALESCE(location, ''), COALESCE(device, ''))",
        );
        expect(isDatabaseInitialized()).toBe(true);

        const statements = (db.query as jest.Mock).mock.calls.map((call) => call[0] as string);
        ['keyword_unique_combination_idx', 'keyword_last_updated_idx', 'keyword_position_idx', 'keyword_updating_idx', 'keyword_domain_updating_idx']
           .forEach((name) => expect(statements.some((sql) => sql.includes(`IF NOT EXISTS ${name}`))).toBe(true));
     });

     it('keeps starting when the unique tracking index cannot be created', async () => {
        (db.sync as jest.Mock).mockResolvedValue(undefined);
        (db.query as jest.Mock).mockImplementation(async (sql: string) => {
           if (sql.includes('CREATE UNIQUE INDEX')) { throw new Error('UNIQUE constraint failed'); }
           return [undefined, 0];
        });

        await expect(initializeDatabase()).resolves.toBeUndefined();
        expect(isDatabaseInitialized()).toBe(true);
     });

     it('should reset stale keyword updating flags on startup', async () => {
        (db.sync as jest.Mock).mockResolvedValue(undefined);
        (Keyword.update as jest.Mock).mockResolvedValue([2]);

        await initializeDatabase();

        expect(Keyword.update).toHaveBeenCalledWith(
           { updating: 0, updatingStartedAt: null },
           { where: { updating: 1 } },
        );
     });

     it('should still initialize successfully if clearing stale flags fails', async () => {
        (db.sync as jest.Mock).mockResolvedValue(undefined);
        (Keyword.update as jest.Mock).mockRejectedValue(new Error('locked'));

        await initializeDatabase();

        expect(isDatabaseInitialized()).toBe(true);
     });

     it('should not re-initialize if already initialized', async () => {
        (db.sync as jest.Mock).mockResolvedValue(undefined);

        await initializeDatabase();
        await initializeDatabase();
        await initializeDatabase();

        expect(db.sync).toHaveBeenCalledTimes(1);
        expect(isDatabaseInitialized()).toBe(true);
     });

     it('shares one initialization while concurrent calls are pending', async () => {
        let finishSync!: () => void;
        (db.sync as jest.Mock).mockReturnValue(new Promise<void>((resolve) => { finishSync = resolve; }));

        const promise1 = initializeDatabase();
        const promise2 = initializeDatabase();
        const promise3 = initializeDatabase();

        expect(db.sync).toHaveBeenCalledTimes(1);
        finishSync();
        await Promise.all([promise1, promise2, promise3]);

        expect(db.sync).toHaveBeenCalledTimes(1);
        expect(isDatabaseInitialized()).toBe(true);
     });

     it('should allow retry after initialization failure', async () => {
        (db.sync as jest.Mock)
           .mockRejectedValueOnce(new Error('Connection failed'))
           .mockResolvedValueOnce(undefined);

        await expect(initializeDatabase()).rejects.toThrow('Connection failed');
        expect(isDatabaseInitialized()).toBe(false);

        await initializeDatabase();
        expect(isDatabaseInitialized()).toBe(true);
        expect(db.sync).toHaveBeenCalledTimes(2);
     });

     it('should reset initialization state', async () => {
        (db.sync as jest.Mock).mockResolvedValue(undefined);

        await initializeDatabase();
        expect(isDatabaseInitialized()).toBe(true);

        resetDatabaseInitialization();
        expect(isDatabaseInitialized()).toBe(false);

        await initializeDatabase();
        expect(db.sync).toHaveBeenCalledTimes(2);
     });



     it('should propagate initialization errors from ensureDatabase and allow retry', async () => {
        (db.sync as jest.Mock)
           .mockRejectedValueOnce(new Error('Database connection failed'))
           .mockResolvedValueOnce(undefined);

        // First call should fail
        await expect(ensureDatabase()).rejects.toThrow('Database connection failed');
        expect(isDatabaseInitialized()).toBe(false);

        // Second call should succeed (retry after failure)
        await ensureDatabase();
        expect(isDatabaseInitialized()).toBe(true);
        expect(db.sync).toHaveBeenCalledTimes(2);
     });
  });
});

describe('sqlite dialect', () => {
  // Common test constants to reduce string duplication
  const TABLE_NAMES = {
    SAMPLE: 'sample',
    SAMPLE_SINGLE: 'sample_single',
    SAMPLE_VARIADIC: 'sample_variadic',
    SAMPLE_NULL: 'sample_null',
    SAMPLE_OPTIONAL: 'sample_optional',
  } as const;

  const COMMON_COLUMNS = {
    ID_PRIMARY_KEY: 'id INTEGER PRIMARY KEY',
    NAME_TEXT: 'name TEXT',
    VALUE_TEXT: 'value TEXT',
    SCORE_INTEGER: 'score INTEGER',
  } as const;

  const SQL_TEMPLATES = {
    CREATE_TABLE: (tableName: string, columns: string) => `CREATE TABLE ${tableName} (${columns})`,
    SELECT_NAME_WHERE_NAME: (tableName: string) => `SELECT name FROM ${tableName} WHERE name = $name`,
    SELECT_NAME_WHERE_NAME_POSITIONAL: (tableName: string) => `SELECT name FROM ${tableName} WHERE name = ?`,
    INSERT_NAME_VALUES: (tableName: string) => `INSERT INTO ${tableName} (name) VALUES ($name)`,
  } as const;

  const TEST_VALUES = {
    SENTINEL: 'test-entry',
    SINGLE_PLACEHOLDER: 'single-placeholder-entry',
    VARIADIC_ENTRY: 'variadic-entry',
    OPTIONAL_CALLBACK: 'optional-callback-row',
  } as const;

  describe('Boolean coercion in sqlite dialect', () => {
      it('binds positional true and false values as SQLite integers', async () => {
        await new Promise<void>((resolve, reject) => {
          const sqliteFlags = sqlite.OPEN_READWRITE + sqlite.OPEN_CREATE;
          const db = new sqlite.Database(':memory:', sqliteFlags, (err) => {
            if (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
              return;
            }

            db.serialize(async () => {
              try {
                // Create a test table
                await new Promise<void>((res, rej) => {
                  db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, flag INTEGER)', (createErr) => {
                    if (createErr) {
                      rej(createErr instanceof Error ? createErr : new Error(String(createErr)));
                      return;
                    }
                    res();
                  });
                });

                // Test with boolean values
                await new Promise<void>((res, rej) => {
                  db.run(
                    'INSERT INTO test (flag) VALUES (?)',
                    true,
                    function insertCallback(insertErr) {
                      if (insertErr) {
                        rej(insertErr instanceof Error ? insertErr : new Error(String(insertErr)));
                        return;
                      }
                      expect(this.lastID).toBe(1);
                      expect(this.changes).toBe(1);
                      res();
                    }
                  );
                });

                await new Promise<void>((res, rej) => {
                  db.run(
                    'INSERT INTO test (flag) VALUES (?)',
                    false,
                    function insertCallback(insertErr) {
                      if (insertErr) {
                        rej(insertErr instanceof Error ? insertErr : new Error(String(insertErr)));
                        return;
                      }
                      expect(this.lastID).toBe(2);
                      expect(this.changes).toBe(1);
                      res();
                    }
                  );
                });

                // Verify the values
                await new Promise<void>((res, rej) => {
                  db.all<{ id: number; flag: number }>(
                    'SELECT * FROM test ORDER BY id',
                    (queryErr, rows) => {
                      if (queryErr) {
                        rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                        return;
                      }
                      expect(rows).toEqual([
                        { id: 1, flag: 1 },  // true -> 1
                        { id: 2, flag: 0 }   // false -> 0
                      ]);
                      res();
                    }
                  );
                });

                db.close((closeErr) => {
                  if (closeErr) {
                    reject(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
                    return;
                  }
                  resolve();
                });
              } catch (error) {
                const wrappedError = error instanceof Error ? error : new Error(String(error));
                reject(wrappedError);
              }
            });
          });
        });
      });

      it('binds named true values as SQLite integers', async () => {
        await new Promise<void>((resolve, reject) => {
          const sqliteFlags = sqlite.OPEN_READWRITE + sqlite.OPEN_CREATE;
          const db = new sqlite.Database(':memory:', sqliteFlags, (err) => {
            if (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
              return;
            }

            db.serialize(async () => {
              try {
                // Create a test table
                await new Promise<void>((res, rej) => {
                  db.run('CREATE TABLE test2 (id INTEGER PRIMARY KEY, flag INTEGER)', (createErr) => {
                    if (createErr) {
                      rej(createErr instanceof Error ? createErr : new Error(String(createErr)));
                      return;
                    }
                    res();
                  });
                });

                // Test with named boolean parameter
                await new Promise<void>((res, rej) => {
                  db.run(
                    'INSERT INTO test2 (flag) VALUES ($flag)',
                    { $flag: true },
                    function insertCallback(insertErr) {
                      if (insertErr) {
                        rej(insertErr instanceof Error ? insertErr : new Error(String(insertErr)));
                        return;
                      }
                      expect(this.lastID).toBe(1);
                      expect(this.changes).toBe(1);
                      res();
                    }
                  );
                });

                // Verify the value
                await new Promise<void>((res, rej) => {
                  db.get<{ flag: number }>(
                    'SELECT flag FROM test2 WHERE id = 1',
                    (queryErr, row) => {
                      if (queryErr) {
                        rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                        return;
                      }
                      expect(row).toEqual({ flag: 1 }); // true -> 1
                      res();
                    }
                  );
                });

                db.close((closeErr) => {
                  if (closeErr) {
                    reject(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
                    return;
                  }
                  resolve();
                });
              } catch (error) {
                const wrappedError = error instanceof Error ? error : new Error(String(error));
                reject(wrappedError);
              }
            });
          });
        });
      });
    });

  describe('sqlite dialect wrapper', () => {
    const openMemoryDatabase = async () => new Promise<any>((resolve, reject) => {
      const database = new sqlite.Database(':memory:', sqlite.OPEN_READWRITE + sqlite.OPEN_CREATE, (error: Error | null) => {
        if (error) reject(error);
        else resolve(database);
      });
    });

    it('runs basic statements and exposes sqlite-style metadata', async () => {
      await new Promise<void>((resolve, reject) => {
        const sqliteFlags = sqlite.OPEN_READWRITE + sqlite.OPEN_CREATE;
        const db = new sqlite.Database(':memory:', sqliteFlags, (err) => {
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }

          db.serialize(async () => {
            try {
              await new Promise<void>((res, rej) => {
                db.run(SQL_TEMPLATES.CREATE_TABLE(TABLE_NAMES.SAMPLE, `${COMMON_COLUMNS.ID_PRIMARY_KEY}, ${COMMON_COLUMNS.NAME_TEXT}`), (createErr) => {
                  if (createErr) {
                    rej(createErr instanceof Error ? createErr : new Error(String(createErr)));
                    return;
                  }
                  res();
                });
              });

              await new Promise<void>((res, rej) => {
                db.run(SQL_TEMPLATES.INSERT_NAME_VALUES(TABLE_NAMES.SAMPLE), { $name: TEST_VALUES.SENTINEL }, function insertCallback(insertErr) {
                  if (insertErr) {
                    rej(insertErr instanceof Error ? insertErr : new Error(String(insertErr)));
                    return;
                  }
                  expect(this.lastID).toBe(1);
                  expect(this.changes).toBe(1);
                  res();
                });
              });

              await new Promise<void>((res, rej) => {
                db.all<{ name: string }>(`SELECT name FROM ${TABLE_NAMES.SAMPLE}`, (queryErr, rows) => {
                  if (queryErr) {
                    rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                    return;
                  }
                  expect(rows).toEqual([{ name: TEST_VALUES.SENTINEL }]);
                  res();
                });
              });

              db.close((closeErr) => {
                if (closeErr) {
                  reject(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
                  return;
                }
                resolve();
              });
            } catch (error) {
              const wrappedError = error instanceof Error ? error : new Error(String(error));
              reject(wrappedError);
            }
          });
        });
      });
    });

    it('falls back to run when SQLite requires it for get or all statements', async () => {
      const database = await openMemoryDatabase();
      const statement = {
        get: () => { throw new Error('Use run() instead'); },
        all: () => { throw new Error('Use run() instead'); },
        run: jest.fn(() => ({ lastInsertRowid: 41, changes: 2 })),
      };
      const prepareSpy = jest.spyOn(database.driver, 'prepare').mockReturnValue(statement as any);

      try {
        const getResult = await new Promise<any>((resolve, reject) => {
          database.get('SELECT 1', function getCallback(error: Error | null, result: unknown) {
            if (error) return reject(error);
            resolve({ result, lastID: this.lastID, changes: this.changes });
          });
        });
        expect(getResult).toEqual({ result: undefined, lastID: 41, changes: 2 });

        const allResult = await new Promise<any>((resolve, reject) => {
          database.all('SELECT 1', function allCallback(error: Error | null, rows: unknown[]) {
            if (error) return reject(error);
            resolve({ rows, lastID: this.lastID, changes: this.changes });
          });
        });
        expect(allResult).toEqual({ rows: [], lastID: 41, changes: 2 });
        expect(statement.run).toHaveBeenCalledTimes(2);
      } finally {
        prepareSpy.mockRestore();
        await new Promise<void>((resolve, reject) => database.close((error: Error | null) => error ? reject(error) : resolve()));
      }
    });

    it('returns ordinary statement errors through the callback without attempting the fallback', async () => {
      const database = await openMemoryDatabase();
      const statement = { get: () => { throw new Error('SQL syntax error'); }, run: jest.fn() };
      const prepareSpy = jest.spyOn(database.driver, 'prepare').mockReturnValue(statement as any);

      try {
        const result = await new Promise<{ error: Error | null; row: unknown }>((resolve) => {
          database.get('SELECT broken', (error: Error | null, row: unknown) => resolve({ error, row }));
        });
        expect(result.error).toEqual(expect.objectContaining({ message: 'SQL syntax error' }));
        expect(result.row).toBeUndefined();
        expect(statement.run).not.toHaveBeenCalled();
      } finally {
        prepareSpy.mockRestore();
        await new Promise<void>((resolve, reject) => database.close((error: Error | null) => error ? reject(error) : resolve()));
      }
    });

    it('preserves positional bindings for single placeholder statements', async () => {
      await new Promise<void>((resolve, reject) => {
        const sqliteFlags = sqlite.OPEN_READWRITE + sqlite.OPEN_CREATE;
        const db = new sqlite.Database(':memory:', sqliteFlags, (err) => {
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }

          db.serialize(async () => {
            const sentinelValue = TEST_VALUES.SINGLE_PLACEHOLDER;

            try {
              await new Promise<void>((res, rej) => {
                const tableDefinition = `${COMMON_COLUMNS.ID_PRIMARY_KEY}, ${COMMON_COLUMNS.NAME_TEXT}`;
                db.run(SQL_TEMPLATES.CREATE_TABLE(TABLE_NAMES.SAMPLE_SINGLE, tableDefinition), (createErr) => {
                  if (createErr) {
                    rej(createErr instanceof Error ? createErr : new Error(String(createErr)));
                    return;
                  }
                  res();
                });
              });

              await new Promise<void>((res, rej) => {
                db.run(
                  `INSERT INTO ${TABLE_NAMES.SAMPLE_SINGLE} (name) VALUES (?)`,
                  sentinelValue,
                  function insertCallback(insertErr) {
                    if (insertErr) {
                      rej(insertErr instanceof Error ? insertErr : new Error(String(insertErr)));
                      return;
                    }
                    expect(this.lastID).toBe(1);
                    expect(this.changes).toBe(1);
                    res();
                  },
                );
              });

              await new Promise<void>((res, rej) => {
                db.get<{ name: string }>(
                  `SELECT name FROM ${TABLE_NAMES.SAMPLE_SINGLE} WHERE name = ?`,
                  sentinelValue,
                  (queryErr, row) => {
                    if (queryErr) {
                      rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                      return;
                    }
                    expect(row).toEqual({ name: sentinelValue });
                    res();
                  },
                );
              });

              db.close((closeErr) => {
                if (closeErr) {
                  reject(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
                  return;
                }
                resolve();
              });
            } catch (error) {
              const wrappedError = error instanceof Error ? error : new Error(String(error));
              reject(wrappedError);
            }
          });
        });
      });
    });

    it('supports variadic parameter bindings across sqlite APIs', async () => {
      await new Promise<void>((resolve, reject) => {
        const sqliteFlags = sqlite.OPEN_READWRITE + sqlite.OPEN_CREATE;
        const db = new sqlite.Database(':memory:', sqliteFlags, (err) => {
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }

          db.serialize(async () => {
            try {
              await new Promise<void>((res, rej) => {
                const tableDefinition = `${COMMON_COLUMNS.ID_PRIMARY_KEY}, ${COMMON_COLUMNS.NAME_TEXT}, ${COMMON_COLUMNS.SCORE_INTEGER}`;
                db.run(SQL_TEMPLATES.CREATE_TABLE(TABLE_NAMES.SAMPLE_VARIADIC, tableDefinition), (createErr) => {
                  if (createErr) {
                    rej(createErr instanceof Error ? createErr : new Error(String(createErr)));
                    return;
                  }
                  res();
                });
              });

              await new Promise<void>((res, rej) => {
                db.run(
                  `INSERT INTO ${TABLE_NAMES.SAMPLE_VARIADIC} (name, score) VALUES (?, ?)`,
                  TEST_VALUES.VARIADIC_ENTRY,
                  99,
                  function insertCallback(insertErr) {
                    if (insertErr) {
                      rej(insertErr instanceof Error ? insertErr : new Error(String(insertErr)));
                      return;
                    }
                    expect(this.lastID).toBe(1);
                    expect(this.changes).toBe(1);
                    res();
                  },
                );
              });

              await new Promise<void>((res, rej) => {
                db.get<{ score: number }>(
                  `SELECT score FROM ${TABLE_NAMES.SAMPLE_VARIADIC} WHERE name = ? AND score = ?`,
                  TEST_VALUES.VARIADIC_ENTRY,
                  99,
                  (queryErr, row) => {
                    if (queryErr) {
                      rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                      return;
                    }
                    expect(row).toEqual({ score: 99 });
                    res();
                  },
                );
              });

              await new Promise<void>((res, rej) => {
                db.all<{ name: string }>(
                  `SELECT name FROM ${TABLE_NAMES.SAMPLE_VARIADIC} WHERE name IN (?, ?)`,
                  TEST_VALUES.VARIADIC_ENTRY,
                  'not-a-match',
                  (queryErr, rows) => {
                    if (queryErr) {
                      rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                      return;
                    }
                    expect(rows).toEqual([{ name: TEST_VALUES.VARIADIC_ENTRY }]);
                    res();
                  },
                );
              });

              db.close((closeErr) => {
                if (closeErr) {
                  reject(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
                  return;
                }
                resolve();
              });
            } catch (error) {
              const wrappedError = error instanceof Error ? error : new Error(String(error));
              reject(wrappedError);
            }
          });
        });
      });
    });

    it('allows null parameter bindings to flow into statements', async () => {
      await new Promise<void>((resolve, reject) => {
        const sqliteFlags = sqlite.OPEN_READWRITE + sqlite.OPEN_CREATE;
        const db = new sqlite.Database(':memory:', sqliteFlags, (err) => {
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }

          db.serialize(async () => {
            try {
              await new Promise<void>((res, rej) => {
                const tableDefinition = `${COMMON_COLUMNS.ID_PRIMARY_KEY}, ${COMMON_COLUMNS.VALUE_TEXT}`;
                db.run(SQL_TEMPLATES.CREATE_TABLE(TABLE_NAMES.SAMPLE_NULL, tableDefinition), (createErr) => {
                  if (createErr) {
                    rej(createErr instanceof Error ? createErr : new Error(String(createErr)));
                    return;
                  }
                  res();
                });
              });

              await new Promise<void>((res, rej) => {
                db.run(
                  `INSERT INTO ${TABLE_NAMES.SAMPLE_NULL} (value) VALUES (?)`,
                  null,
                  function insertCallback(insertErr) {
                    if (insertErr) {
                      rej(insertErr instanceof Error ? insertErr : new Error(String(insertErr)));
                      return;
                    }
                    expect(this.lastID).toBe(1);
                    expect(this.changes).toBe(1);
                    res();
                  },
                );
              });

              await new Promise<void>((res, rej) => {
                db.get<{ value: null }>(
                  `SELECT value FROM ${TABLE_NAMES.SAMPLE_NULL} WHERE value IS ?`,
                  null,
                  (queryErr, row) => {
                    if (queryErr) {
                      rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                      return;
                    }
                    expect(row).toEqual({ value: null });
                    res();
                  },
                );
              });

              await new Promise<void>((res, rej) => {
                db.all<{ id: number }>(
                  `SELECT id FROM ${TABLE_NAMES.SAMPLE_NULL} WHERE value IS ?`,
                  null,
                  (queryErr, rows) => {
                    if (queryErr) {
                      rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                      return;
                    }
                    expect(rows).toEqual([{ id: 1 }]);
                    res();
                  },
                );
              });

              db.close((closeErr) => {
                if (closeErr) {
                  reject(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
                  return;
                }
                resolve();
              });
            } catch (error) {
              const wrappedError = error instanceof Error ? error : new Error(String(error));
              reject(wrappedError);
            }
          });
        });
      });
    });

    it('ignores trailing undefined callbacks when deriving sqlite bindings', async () => {
      await new Promise<void>((resolve, reject) => {
        const sqliteFlags = sqlite.OPEN_READWRITE + sqlite.OPEN_CREATE;
        const db = new sqlite.Database(':memory:', sqliteFlags, (err) => {
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }

          db.serialize(async () => {
            type TrackedMethod = 'run' | 'get' | 'all';
            const recordedCalls: Array<{ sql: string; method: TrackedMethod; args: unknown[] }> = [];
            const trackedMethods = new Set<TrackedMethod>(['run', 'get', 'all']);
            const originalPrepare = db.driver.prepare.bind(db.driver);
            const prepareSpy = jest.spyOn(db.driver, 'prepare');
            prepareSpy.mockImplementation((sql: string, ...prepareArgs: unknown[]) => {
              const statement = originalPrepare(sql, ...prepareArgs);
              return new Proxy(statement as object, {
                get(target, prop, receiver) {
                  const value = Reflect.get(target, prop, receiver);
                  if (
                    typeof prop === 'string'
                    && trackedMethods.has(prop as TrackedMethod)
                    && typeof value === 'function'
                  ) {
                    const method = prop as TrackedMethod;
                    return (...methodArgs: unknown[]) => {
                      recordedCalls.push({ sql, method, args: methodArgs });
                      return value.apply(target, methodArgs);
                    };
                  }
                  if (typeof value === 'function') {
                    return value.bind(target);
                  }
                  return value;
                },
              });
            });

            const insertSql = SQL_TEMPLATES.INSERT_NAME_VALUES(TABLE_NAMES.SAMPLE_OPTIONAL);
            const getSql = `${SQL_TEMPLATES.SELECT_NAME_WHERE_NAME(TABLE_NAMES.SAMPLE_OPTIONAL)} /* undefined callback */`;
            const allSql = `${SQL_TEMPLATES.SELECT_NAME_WHERE_NAME_POSITIONAL(TABLE_NAMES.SAMPLE_OPTIONAL)} /* undefined callback */`;
            const sentinelValue = TEST_VALUES.OPTIONAL_CALLBACK;

            try {
              await new Promise<void>((res, rej) => {
                const tableDefinition = `${COMMON_COLUMNS.ID_PRIMARY_KEY}, ${COMMON_COLUMNS.NAME_TEXT}`;
                db.run(SQL_TEMPLATES.CREATE_TABLE(TABLE_NAMES.SAMPLE_OPTIONAL, tableDefinition), (createErr) => {
                  if (createErr) {
                    rej(createErr instanceof Error ? createErr : new Error(String(createErr)));
                    return;
                  }
                  res();
                });
              });

              db.run(insertSql, { $name: sentinelValue }, undefined);
              db.get(getSql, { $name: sentinelValue }, undefined);
              db.all(allSql, sentinelValue, undefined);

              await new Promise<void>((res, rej) => {
                db.get(
                  SQL_TEMPLATES.SELECT_NAME_WHERE_NAME(TABLE_NAMES.SAMPLE_OPTIONAL),
                  { $name: sentinelValue },
                  (queryErr, row) => {
                    if (queryErr) {
                      rej(queryErr instanceof Error ? queryErr : new Error(String(queryErr)));
                      return;
                    }
                    expect(row).toEqual({ name: sentinelValue });
                    res();
                  },
                );
              });

              const runCall = recordedCalls.find(
                (call) => call.method === 'run' && call.sql === insertSql,
              );
              expect(runCall).toEqual({
                sql: insertSql,
                method: 'run',
                args: [{ name: sentinelValue }],
              });

              const getCall = recordedCalls.find(
                (call) => call.method === 'get' && call.sql === getSql,
              );
              expect(getCall).toEqual({
                sql: getSql,
                method: 'get',
                args: [{ name: sentinelValue }],
              });

              const allCall = recordedCalls.find(
                (call) => call.method === 'all' && call.sql === allSql,
              );
              expect(allCall).toEqual({
                sql: allSql,
                method: 'all',
                args: [sentinelValue],
              });

              db.close((closeErr) => {
                if (closeErr) {
                  reject(closeErr instanceof Error ? closeErr : new Error(String(closeErr)));
                  return;
                }
                resolve();
              });
            } catch (error) {
              const wrappedError = error instanceof Error ? error : new Error(String(error));
              reject(wrappedError);
            } finally {
              prepareSpy.mockRestore();
            }
          });
        });
      });
    });
  });
});

describe('dbBooleans', () => {
  describe('db boolean helpers', () => {
    it('maps values to sqlite integer booleans and sqlite integers back to booleans', () => {
      expect(toDbBool(true)).toBe(1);
      expect(toDbBool(false)).toBe(0);
      expect(toDbBool(1)).toBe(1);
      expect(toDbBool(0)).toBe(0);
      expect(toDbBool(null)).toBe(0);
      expect(toDbBool(undefined)).toBe(0);
      expect(toDbBool('false')).toBe(0);
      expect(toDbBool('yes')).toBe(1);

      expect(fromDbBool(1)).toBe(true);
      expect(fromDbBool(0)).toBe(false);
      expect(fromDbBool(null)).toBe(false);
      expect(fromDbBool(undefined)).toBe(false);
    });

    it('parses strict query values and env flags with one shared rule set', () => {
      expect(['true', ' ON ', 'Yes', '1'].map(parseBooleanStrict)).toEqual([true, true, true, true]);
      expect(['false', 'off', 'NO', '0'].map(parseBooleanStrict)).toEqual([false, false, false, false]);
      expect(['', 'maybe', '2'].map(parseBooleanStrict)).toEqual([null, null, null]);
      expect(parseEnvFlag(undefined)).toBe(true);
      expect(parseEnvFlag('')).toBe(true);
      expect(parseEnvFlag('disabled')).toBe(false);
      expect(parseEnvFlag(' Off ')).toBe(false);
      expect(parseEnvFlag('garbage')).toBe(true);
      expect(parseEnvFlag(undefined, false)).toBe(false);
    });

    describe('normalizeToBoolean', () => {
      it('handles numeric values (DB integers)', () => {
        expect(normalizeToBoolean(1)).toBe(true);
        expect(normalizeToBoolean(0)).toBe(false);
        expect(normalizeToBoolean(42)).toBe(true);
        expect(normalizeToBoolean(-1)).toBe(true);
      });

      it('handles string values (API responses), including values with surrounding whitespace', () => {
        expect(normalizeToBoolean('true')).toBe(true);
        expect(normalizeToBoolean('True')).toBe(true);
        expect(normalizeToBoolean('TRUE')).toBe(true);
        expect(normalizeToBoolean('1')).toBe(true);

        expect(normalizeToBoolean('false')).toBe(false);
        expect(normalizeToBoolean('False')).toBe(false);
        expect(normalizeToBoolean('FALSE')).toBe(false);
        expect(normalizeToBoolean('0')).toBe(false);
        expect(normalizeToBoolean('')).toBe(false);

        expect(normalizeToBoolean('  true  ')).toBe(true);
        expect(normalizeToBoolean('  TRUE  ')).toBe(true);
        expect(normalizeToBoolean('  1  ')).toBe(true);
        expect(normalizeToBoolean('  false  ')).toBe(false);
        expect(normalizeToBoolean('  FALSE  ')).toBe(false);
        expect(normalizeToBoolean('  0  ')).toBe(false);
        expect(normalizeToBoolean('   ')).toBe(false);
      });

      it('uses conservative approach for unrecognized values (returns false), including null and undefined', () => {
        expect(normalizeToBoolean(null)).toBe(false);
        expect(normalizeToBoolean(undefined)).toBe(false);

        // Unrecognized strings should be treated as false for safety
        expect(normalizeToBoolean('error')).toBe(false);
        expect(normalizeToBoolean('timeout')).toBe(false);
        expect(normalizeToBoolean('API Error')).toBe(false);
        expect(normalizeToBoolean('null')).toBe(false);
        expect(normalizeToBoolean('undefined')).toBe(false);
        expect(normalizeToBoolean('2')).toBe(false);
        // Objects and arrays should also be false
        expect(normalizeToBoolean([])).toBe(false);
        expect(normalizeToBoolean({})).toBe(false);
      });

      it('maps recognized synonyms: yes/on to true, off/no to false', () => {
        expect(normalizeToBoolean('yes')).toBe(true);
        expect(normalizeToBoolean('YES')).toBe(true);
        expect(normalizeToBoolean('on')).toBe(true);
        expect(normalizeToBoolean('ON')).toBe(true);
        expect(normalizeToBoolean('off')).toBe(false);
        expect(normalizeToBoolean('OFF')).toBe(false);
        expect(normalizeToBoolean('no')).toBe(false);
        expect(normalizeToBoolean('NO')).toBe(false);
      });

    });


  });

});
