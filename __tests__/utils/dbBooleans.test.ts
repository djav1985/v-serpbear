/** @jest-environment node */

import { fromDbBool, toDbBool, normalizeToBoolean } from '../../utils/dbBooleans';
import parseKeywords from '../../utils/parseKeywords';
import sqlite from '../../database/sqlite-dialect';

describe('db boolean helpers', () => {
  it('maps values to sqlite integer booleans', () => {
    expect(toDbBool(true)).toBe(1);
    expect(toDbBool(false)).toBe(0);
    expect(toDbBool(1)).toBe(1);
    expect(toDbBool(0)).toBe(0);
    expect(toDbBool(null)).toBe(0);
    expect(toDbBool(undefined)).toBe(0);
  });

  it('maps sqlite integers back to booleans', () => {
    expect(fromDbBool(1)).toBe(true);
    expect(fromDbBool(0)).toBe(false);
    expect(fromDbBool(null)).toBe(false);
    expect(fromDbBool(undefined)).toBe(false);
  });

  describe('normalizeToBoolean', () => {
    it('handles numeric values (DB integers)', () => {
      expect(normalizeToBoolean(1)).toBe(true);
      expect(normalizeToBoolean(0)).toBe(false);
      expect(normalizeToBoolean(42)).toBe(true);
      expect(normalizeToBoolean(-1)).toBe(true);
    });

    it('handles string values (API responses)', () => {
      expect(normalizeToBoolean('true')).toBe(true);
      expect(normalizeToBoolean('True')).toBe(true);
      expect(normalizeToBoolean('TRUE')).toBe(true);
      expect(normalizeToBoolean('1')).toBe(true);
      
      expect(normalizeToBoolean('false')).toBe(false);
      expect(normalizeToBoolean('False')).toBe(false);
      expect(normalizeToBoolean('FALSE')).toBe(false);
      expect(normalizeToBoolean('0')).toBe(false);
      expect(normalizeToBoolean('')).toBe(false);
    });

    it('handles string values with whitespace', () => {
      expect(normalizeToBoolean('  true  ')).toBe(true);
      expect(normalizeToBoolean('  TRUE  ')).toBe(true);
      expect(normalizeToBoolean('  1  ')).toBe(true);
      expect(normalizeToBoolean('  false  ')).toBe(false);
      expect(normalizeToBoolean('  FALSE  ')).toBe(false);
      expect(normalizeToBoolean('  0  ')).toBe(false);
      expect(normalizeToBoolean('   ')).toBe(false);
    });

    it('handles null and undefined', () => {
      expect(normalizeToBoolean(null)).toBe(false);
      expect(normalizeToBoolean(undefined)).toBe(false);
    });

    it('uses conservative approach for unrecognized values (returns false)', () => {
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

  describe('normalizeToBoolean integration (parseKeywords DB coercion)', () => {
    const buildKeyword = (overrides: Partial<Record<string, any>> = {}) => ({
      ID: 1,
      keyword: 'example keyword',
      device: 'desktop',
      country: 'US',
      domain: 'example.com',
      lastUpdated: '2025-01-01T00:00:00.000Z',
      added: '2025-01-01T00:00:00.000Z',
      position: 5,
      volume: 100,
      sticky: 1,
      history: JSON.stringify({ '2025-01-01': 5 }),
      lastResult: JSON.stringify([]),
      url: 'https://example.com/page',
      tags: JSON.stringify(['tag']),
      updating: 0,
      lastUpdateError: 'false',
      mapPackTop3: 0,
      ...overrides,
    });

    it('maps integer 1 to true and integer 0 to false', () => {
      const cases: Array<[number, boolean]> = [[1, true], [0, false]];
      for (const [value, expected] of cases) {
        const [k1] = parseKeywords([buildKeyword({ updating: value }) as any]);
        const [k2] = parseKeywords([buildKeyword({ sticky: value }) as any]);
        const [k3] = parseKeywords([buildKeyword({ mapPackTop3: value }) as any]);
        expect(k1.updating).toBe(expected);
        expect(k2.sticky).toBe(expected);
        expect(k3.mapPackTop3).toBe(expected);
      }
    });


    it('coerces non-numeric values to false (default)', () => {
      const [k1] = parseKeywords([buildKeyword({ updating: 'API Error: Invalid request' }) as any]);
      const [k2] = parseKeywords([buildKeyword({ sticky: 'Server error occurred' }) as any]);
      const [k3] = parseKeywords([buildKeyword({ mapPackTop3: 'timeout' }) as any]);
      expect(k1.updating).toBe(false);
      expect(k2.sticky).toBe(false);
      expect(k3.mapPackTop3).toBe(false);
    });
  });
});

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
