/** @jest-environment node */

import sqlite from '../../app/database/sqlite-dialect';

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

describe('sqlite dialect wrapper', () => {
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
            return new Proxy(statement, {
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
            expect(runCall).toBeDefined();
            expect(runCall?.args).toEqual([{ name: sentinelValue }]);

            const getCall = recordedCalls.find(
              (call) => call.method === 'get' && call.sql === getSql,
            );
            expect(getCall).toBeDefined();
            expect(getCall?.args).toEqual([{ name: sentinelValue }]);

            const allCall = recordedCalls.find(
              (call) => call.method === 'all' && call.sql === allSql,
            );
            expect(allCall).toBeDefined();
            expect(allCall?.args).toEqual([sentinelValue]);

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
