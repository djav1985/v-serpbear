/** @jest-environment node */

import sqlite from '../../app/database/sqlite-dialect';

describe('Boolean coercion in sqlite dialect', () => {
  it('should coerce boolean values correctly with simple test', async () => {
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

  it('should coerce boolean values in named parameters', async () => {
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