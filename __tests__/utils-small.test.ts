/** @jest-environment node */

import { formatLocation, getLocationCountry, parseLocation } from '../utils/location';
import { dateKeyInZone, dateKeyToTime, daysAgoKey, formatDateKey, resolveTimezone } from '../utils/timezone';
import { hasTrimmedLength, sanitizeSmtpHost, trimString, trimStringProperties } from '../utils/security';
import { normalizeHostFromString } from '../utils/validators/hostname';
import { fromDbBool, normalizeToBoolean, parseBooleanStrict, parseEnvFlag, toDbBool } from '../utils/dbBooleans';
import parseKeywords from '../utils/parseKeywords';
import sqlite from '../database/sqlite-dialect';
import { historyKeyToTime, normalizeHistoryDateKey, toHistoryDateKey } from '../utils/historyDateKey';
import { UNRANKED_PENALTY_PER_PAGE, getUnrankedPenalty, summarizeAveragePosition } from '../utils/averagePosition';
import type { NextApiRequest } from 'next';
import isRequestSecure from '../utils/api/isRequestSecure';
import { parseStrictBooleanQueryParam } from '../pages/api/serp/domains';
import { errorResponse } from '../utils/api/response';
import normalizeOrigin from '../utils/normalizeOrigin';

describe('location', () => {
  describe('getLocationCountry', () => {
     it('returns the country of a full city, state, country location', () => {
        expect(getLocationCountry('London,England,GB')).toBe('GB');
        expect(getLocationCountry('Austin,TX,US')).toBe('US');
     });

     it('treats a bare country code as the whole location', () => {
        expect(getLocationCountry('US')).toBe('US');
     });

     it('returns an empty string for empty, null or undefined locations', () => {
        expect(getLocationCountry('')).toBe('');
        expect(getLocationCountry('   ')).toBe('');
        expect(getLocationCountry(null)).toBe('');
        expect(getLocationCountry(undefined)).toBe('');
     });

     it('returns an empty string when the location has no known country', () => {
        expect(getLocationCountry('Austin,TX')).toBe('');
        expect(getLocationCountry('Austin')).toBe('');
        expect(getLocationCountry('Austin,TX,QX')).toBe('');
     });

     it('does not treat object prototype keys as countries', () => {
        expect(getLocationCountry('constructor')).toBe('');
        expect(getLocationCountry('toString')).toBe('');
     });
  });

  describe('location formatting helpers', () => {
     it('formats and parses a location round trip', () => {
        const location = formatLocation({ city: 'Austin', state: 'TX', country: 'US' });
        expect(location).toBe('Austin,TX,US');
        expect(parseLocation(location)).toEqual({ city: 'Austin', state: 'TX', country: 'US' });
     });
  });
});

describe('timezone', () => {
  describe('app time zone helpers', () => {
    const instant = '2026-01-06T02:30:00Z';

    it('gives the calendar day of one instant in each zone', () => {
      expect(dateKeyInZone(instant, 'America/Los_Angeles')).toBe('2026-01-05');
      expect(dateKeyInZone(instant, 'UTC')).toBe('2026-01-06');
      expect(dateKeyInZone(instant, 'Pacific/Auckland')).toBe('2026-01-06');
    });

    it('steps back across a month boundary', () => {
      const now = new Date('2026-03-02T12:00:00Z');

      expect(daysAgoKey(3, 'UTC', now)).toBe('2026-02-27');
    });

    it('steps back across the US DST change in calendar days', () => {
      // DST starts 2026-03-08 in America/New_York, so 2026-03-09 12:00Z is 08:00 EDT.
      const now = new Date('2026-03-09T12:00:00Z');

      expect(daysAgoKey(2, 'America/New_York', now)).toBe('2026-03-07');
    });

    it('falls back to America/New_York for invalid or empty zone names', () => {
      expect(resolveTimezone('Not/A_Zone')).toBe('America/New_York');
      expect(resolveTimezone('')).toBe('America/New_York');
      expect(resolveTimezone(undefined)).toBe('America/New_York');
    });

    it('formats a date key as a label without shifting the day', () => {
      expect(formatDateKey('2026-01-05')).toBe('Jan 5, 2026');
    });

    it('reads padded and unpadded keys as the same day', () => {
      expect(dateKeyToTime('2026-1-5')).toBe(dateKeyToTime('2026-01-05'));
    });
  });
});

describe('security', () => {
  describe('Security Utilities', () => {
     describe('trimStringProperties', () => {
        it('should trim all string properties in an object', () => {
           const input = {
              stringProp: '  trimmed  ',
              anotherString: '\twhitespace\n',
              numberProp: 123,
              booleanProp: true,
              nullProp: null,
              undefinedProp: undefined
           };

           const result = trimStringProperties(input);

           expect(result.stringProp).toBe('trimmed');
           expect(result.anotherString).toBe('whitespace');
           expect(result.numberProp).toBe(123);
           expect(result.booleanProp).toBe(true);
           expect(result.nullProp).toBe(null);
           expect(result.undefinedProp).toBe(undefined);
        });

        it('should return a new copy without modifying the original, and equal copies for empty or non-string props', () => {
           const input = {
              stringProp: '  original  ',
              numberProp: 456
           };

           const result = trimStringProperties(input);

           expect(input.stringProp).toBe('  original  ');
           expect(result.stringProp).toBe('original');
           expect(input).not.toBe(result);

           expect(trimStringProperties({})).toEqual({});

           const nonString = {
              numberProp: 123,
              booleanProp: false,
              arrayProp: [1, 2, 3]
           };

           const copy = trimStringProperties(nonString);
           expect(copy).toEqual(nonString);
           expect(copy).not.toBe(nonString); // Should still be a copy
        });
     });

     describe('trimString', () => {
        it('trims whitespace from strings', () => {
           expect(trimString('  hello  ')).toBe('hello');
           expect(trimString('\t\nworld\r\n')).toBe('world');
        });

        it('returns empty string for null, undefined and empty input', () => {
           expect(trimString(null)).toBe('');
           expect(trimString(undefined)).toBe('');
           expect(trimString('')).toBe('');
        });
     });

     describe('hasTrimmedLength', () => {
        it('should return true for non-empty trimmed strings', () => {
           expect(hasTrimmedLength('hello')).toBe(true);
           expect(hasTrimmedLength('  world  ')).toBe(true);
           expect(hasTrimmedLength('\ttest\n')).toBe(true);
        });

        it('should return false for empty, whitespace-only, null or undefined values', () => {
           expect(hasTrimmedLength('')).toBe(false);
           expect(hasTrimmedLength('   ')).toBe(false);
           expect(hasTrimmedLength('\t\n\r ')).toBe(false);
           expect(hasTrimmedLength(null)).toBe(false);
           expect(hasTrimmedLength(undefined)).toBe(false);
        });

        it('should treat numbers and booleans as present values', () => {
           for (const value of [587, 0, -1, true, false]) {
              expect(hasTrimmedLength(value)).toBe(true);
           }
        });
     });
  });

  describe('sanitizeSmtpHost', () => {
     it('returns a domain hostname trimmed and lowercased', () => {
        expect(sanitizeSmtpHost('smtp.example.com')).toBe('smtp.example.com');
        expect(sanitizeSmtpHost('  MAIL.EXAMPLE.COM  ')).toBe('mail.example.com');
     });

     it('strips a trailing dot', () => {
        expect(sanitizeSmtpHost('smtp.example.com.')).toBe('smtp.example.com');
     });

     it('accepts localhost, single-label Docker service names and IP addresses', () => {
        expect(sanitizeSmtpHost('localhost')).toBe('localhost');
        expect(sanitizeSmtpHost('mail')).toBe('mail');
        expect(sanitizeSmtpHost('  mailserver  ')).toBe('mailserver');
        expect(sanitizeSmtpHost('192.168.1.1')).toBe('192.168.1.1');
        expect(sanitizeSmtpHost('10.0.0.1')).toBe('10.0.0.1');
     });

     it('returns empty string for null, undefined, or blank input', () => {
        expect(sanitizeSmtpHost(null)).toBe('');
        expect(sanitizeSmtpHost(undefined)).toBe('');
        expect(sanitizeSmtpHost('')).toBe('');
        expect(sanitizeSmtpHost('   ')).toBe('');
     });
  });

  describe('normalizeHostFromString', () => {
     it('normalizes URLs and hostnames to bare hosts', () => {
        expect(normalizeHostFromString(' https://WWW.Example.com/path ')).toBe('example.com');
        expect(normalizeHostFromString('example.com/path')).toBe('example.com');
        expect(normalizeHostFromString('sub.Example.com')).toBe('sub.example.com');
        expect(normalizeHostFromString('http://www.sub.example.com/')).toBe('sub.example.com');
     });

     it('returns null for invalid inputs', () => {
        expect(normalizeHostFromString('')).toBeNull();
        expect(normalizeHostFromString('not a url')).toBeNull();
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
});

describe('historyDateKey', () => {
  describe('history date keys', () => {
    it('writes the zero-padded calendar date in the given time zone, whatever the machine time zone is', () => {
      // 23:59 on Jan 5 and 00:00 on Nov 12 in New York (UTC-5 in both months)
      expect(toHistoryDateKey(new Date(Date.UTC(2026, 0, 6, 4, 59)), 'America/New_York')).toBe('2026-01-05');
      expect(toHistoryDateKey(new Date(Date.UTC(2026, 10, 12, 5, 0)), 'America/New_York')).toBe('2026-11-12');
      expect(toHistoryDateKey(new Date(Date.UTC(2026, 10, 12, 5, 0)), 'Asia/Tokyo')).toBe('2026-11-12');
    });

    it('reads a key as UTC midnight of that calendar day', () => {
      expect(historyKeyToTime('2026-01-05')).toBe(Date.UTC(2026, 0, 5));
    });

    it('orders keys by day', () => {
      const keys = ['2026-11-02', '2026-01-31', '2026-02-01'];

      expect([...keys].sort((a, b) => historyKeyToTime(a) - historyKeyToTime(b))).toEqual(['2026-01-31', '2026-02-01', '2026-11-02']);
    });

    it('falls back to Date parsing for anything that is not a date key', () => {
      expect(historyKeyToTime('not a date')).toBeNaN();
    });
  });

  describe('normalizeHistoryDateKey', () => {
    it('pads unpadded keys and leaves other keys alone', () => {
      expect(normalizeHistoryDateKey('2026-1-5')).toBe('2026-01-05');
      expect(normalizeHistoryDateKey('2026-11-12')).toBe('2026-11-12');
      expect(normalizeHistoryDateKey('not a date')).toBe('not a date');
    });
  });
});

describe('averagePosition', () => {
  describe('summarizeAveragePosition map pack rule', () => {
    // A keyword counted alone: avgPosition is its counted position, 0 when it is left out.
    const counted = (keyword: Record<string, unknown>) => summarizeAveragePosition([keyword], 30).avgPosition;
    const localResults = (spot: number) => JSON.stringify([
      { position: 1, title: 'Other', isOwn: false },
      { position: spot, title: 'Mine', isOwn: true },
    ]);
    const droppedBefore = { '2026-11-01': 5 };

    it('counts the better of the map pack spot and the organic position, ignoring organic 0', () => {
      expect(counted({ position: 1, mapPackTop3: 1, localResults: localResults(3) })).toBe(1);
      expect(counted({ position: 10, mapPackTop3: 1, localResults: localResults(2) })).toBe(2);
      expect(counted({ position: 5, mapPackTop3: 1, localResults: localResults(3) })).toBe(3);
      // Organic 0 is ignored and a keyword with a spot is never penalized
      expect(counted({ position: 0, mapPackTop3: 1, localResults: localResults(2), history: droppedBefore })).toBe(2);
      // Parsed array works the same as the stored JSON string
      expect(counted({ position: 0, mapPackTop3: 1, localResults: JSON.parse(localResults(2)), history: droppedBefore })).toBe(2);
      // Map pack flag off: the spot is not used, the organic rule applies
      expect(counted({ position: 7, mapPackTop3: 0, localResults: localResults(1) })).toBe(7);

      // No spot can be derived (malformed, empty, out of range): the current rule applies
      // Malformed, empty, or out-of-range spot: organic > 0 counts at organic, organic 0 is left out (not penalized)
      expect(counted({ position: 4, mapPackTop3: 1, localResults: '{not json' })).toBe(4);
      expect(counted({ position: 4, mapPackTop3: 1, localResults: '' })).toBe(4);
      expect(counted({ position: 4, mapPackTop3: 1, localResults: '[]' })).toBe(4);
      expect(counted({ position: 4, mapPackTop3: 1, localResults: null })).toBe(4);
      expect(counted({ position: 4, mapPackTop3: 1, localResults: JSON.stringify([{ position: 4, isOwn: true }]) })).toBe(4);
      expect(counted({ position: 0, mapPackTop3: 1, localResults: '[]', history: droppedBefore })).toBe(0);
      expect(counted({ position: 0, mapPackTop3: 1, localResults: 'nope', history: droppedBefore })).toBe(0);
      // Without a map pack flag, a keyword that ranked before and dropped out still takes the penalty
      expect(counted({ position: 0, mapPackTop3: 0, localResults: localResults(2), history: droppedBefore })).toBe(30);
    });
  });

  describe('getUnrankedPenalty', () => {
    it('is 10 points per scraped page: 10 for basic (or no strategy), 30 for custom with 3 pages', () => {
      expect(UNRANKED_PENALTY_PER_PAGE).toBe(10);
      expect(getUnrankedPenalty({ scrape_strategy: 'basic', scrape_pagination_limit: 5 }, null)).toBe(10);
      expect(getUnrankedPenalty({ scrape_strategy: 'custom', scrape_pagination_limit: 3 }, null)).toBe(30);
      // Any strategy other than custom counts as basic
      expect(getUnrankedPenalty({ scrape_strategy: 'smart', scrape_pagination_limit: 3 }, null)).toBe(10);
      expect(getUnrankedPenalty({}, {})).toBe(10);
    });

    it('uses the domain strategy and page limit over the global ones, and falls back to 1 page for an unset custom limit', () => {
      // Domain on custom 4 pages overrides a global basic strategy
      expect(getUnrankedPenalty({ scrape_strategy: 'basic' }, { scrape_strategy: 'custom', scrape_pagination_limit: 4 })).toBe(40);
      // Domain on basic overrides a global custom strategy
      expect(getUnrankedPenalty({ scrape_strategy: 'custom', scrape_pagination_limit: 3 }, { scrape_strategy: 'basic' })).toBe(10);
      // Custom with no limit anywhere is 1 page (not the scraper's 5)
      expect(getUnrankedPenalty({ scrape_strategy: 'custom' }, { scrape_strategy: 'custom', scrape_pagination_limit: 0 })).toBe(10);
      // Empty domain strategy inherits the global custom strategy and its limit
      expect(getUnrankedPenalty({ scrape_strategy: 'custom', scrape_pagination_limit: 2 }, { scrape_strategy: '' })).toBe(20);
    });
  });
});

describe('api helpers', () => {
  /**
   * Consolidated behavior suite for API utility helpers.
   *
   * Replaces the three individual micro-test files:
   *   - isRequestSecure.test.ts
   *   - parseBooleanQueryParam.test.ts
   *   - response.test.ts
   *
   * Each module keeps its own `describe` block for readability.
   */


  // ---------------------------------------------------------------------------
  // isRequestSecure
  // ---------------------------------------------------------------------------

  const createRequestWithHeaders = (
    headers: Record<string, string | string[]>,
    encrypted?: boolean,
  ): NextApiRequest => {
    const socket = encrypted !== undefined ? { encrypted } : undefined;
    return { headers, socket } as unknown as NextApiRequest;
  };

  describe('isRequestSecure', () => {
    const originalTrustProxy = process.env.TRUST_PROXY;
    // The forwarded-header cases run behind one trusted proxy; the fallback case clears TRUST_PROXY
    beforeEach(() => { process.env.TRUST_PROXY = '1'; });
    afterEach(() => {
      if (originalTrustProxy === undefined) { delete process.env.TRUST_PROXY; } else { process.env.TRUST_PROXY = originalTrustProxy; }
    });

    it('detects https in x-forwarded-proto (exact, comma-delimited, array, case-insensitive)', () => {
      const cases: Array<[string | string[], boolean]> = [
        ['https', true],
        ['http', false],
        ['https,http', true],
        ['http,https', true],
        ['http,http', false],
        ['https, http', true],
        [['https', 'http'], true],
        [['http', 'http'], false],
        ['HTTPS', true],
        ['HTTPS,HTTP', true],
      ];
      for (const [value, expected] of cases) {
        expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': value }))).toBe(expected);
      }
    });

    it('honours x-forwarded-protocol and x-forwarded-ssl proxy headers', () => {
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-protocol': 'https' }))).toBe(true);
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-ssl': 'on' }))).toBe(true);
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-ssl': 'ON' }))).toBe(true);
    });

    it('ignores forwarded protocol headers without TRUST_PROXY and uses only socket encryption', () => {
      delete process.env.TRUST_PROXY;
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'https' }))).toBe(false);
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-protocol': 'https' }))).toBe(false);
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-ssl': 'on' }))).toBe(false);
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'https' }, true))).toBe(true);
    });

    it('falls back to socket encryption and reports insecure when no indicator is present', () => {
      expect(isRequestSecure(createRequestWithHeaders({}, true))).toBe(true);
      expect(isRequestSecure(createRequestWithHeaders({}, false))).toBe(false);
      expect(isRequestSecure(createRequestWithHeaders({}))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // parseStrictBooleanQueryParam
  // ---------------------------------------------------------------------------

  describe('parseStrictBooleanQueryParam', () => {
    it('returns null for undefined (param not present)', () => {
      expect(parseStrictBooleanQueryParam(undefined)).toBeNull();
    });

    it('maps accepted true and false spellings to { ok: true, value }', () => {
      const cases: Array<[string, boolean]> = [
        ['true', true], ['TRUE', true], ['1', true], ['on', true], ['yes', true],
        ['false', false], ['FALSE', false], ['0', false], ['off', false], ['no', false],
      ];
      for (const [value, expected] of cases) {
        expect(parseStrictBooleanQueryParam(value)).toEqual({ ok: true, value: expected });
      }
    });

    it('trims surrounding whitespace before matching', () => {
      expect(parseStrictBooleanQueryParam('  true  ')).toEqual({ ok: true, value: true });
      expect(parseStrictBooleanQueryParam('  false  ')).toEqual({ ok: true, value: false });
    });

    it('returns { ok: false } for unknown, empty or whitespace-only values', () => {
      for (const value of ['maybe', 'enabled', 'null', '2', '', '   ']) {
        expect(parseStrictBooleanQueryParam(value)).toMatchObject({ ok: false });
      }
    });

    it('uses the last array element and rejects an unknown last element', () => {
      expect(parseStrictBooleanQueryParam(['false', 'true'])).toEqual({ ok: true, value: true });
      expect(parseStrictBooleanQueryParam(['true', 'false'])).toEqual({ ok: true, value: false });
      expect(parseStrictBooleanQueryParam(['true', 'maybe'])).toMatchObject({ ok: false });
    });

    it('returns { ok: false } for empty array', () => {
      expect(parseStrictBooleanQueryParam([])).toMatchObject({ ok: false });
    });
  });

  // ---------------------------------------------------------------------------
  // errorResponse
  // ---------------------------------------------------------------------------

  describe('errorResponse', () => {
    it('constructs a failure envelope with code and message', () => {
      const result = errorResponse('NOT_FOUND', 'Resource not found');
      expect(result).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    });

    it('includes requestId and details when provided', () => {
      const withRequestId = errorResponse('BAD_REQUEST', 'Invalid input', 'req-abc');
      expect(withRequestId.requestId).toBe('req-abc');

      const withDetails = errorResponse('BAD_REQUEST', 'Validation failed', undefined, ['field is required']);
      expect(withDetails.error.details).toEqual(['field is required']);
    });

    it('omits requestId and details when undefined', () => {
      const result = errorResponse('SERVER_ERROR', 'Boom');
      expect(result.requestId).toBeUndefined();
      expect(result.error.details).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeOrigin
  // ---------------------------------------------------------------------------

  describe('normalizeOrigin', () => {
    it('removes one or more trailing slashes, keeping any path', () => {
      const cases: Array<[string, string]> = [
        ['https://example.com/', 'https://example.com'],
        ['https://example.com///', 'https://example.com'],
        ['https://example.com/path/', 'https://example.com/path'],
      ];
      for (const [input, expected] of cases) {
        expect(normalizeOrigin(input)).toBe(expected);
      }
    });

    it('leaves a URL with no trailing slash and an empty string unchanged, and returns empty for only slashes', () => {
      expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
      expect(normalizeOrigin('')).toBe('');
      expect(normalizeOrigin('///')).toBe('');
    });
  });
});
