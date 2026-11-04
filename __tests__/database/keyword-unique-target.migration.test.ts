export {};

import migration from '../../database/migrations/1775000000000-keyword-unique-tracking-target.js';

const { planDuplicateRemovals } = migration as unknown as { planDuplicateRemovals: (rows: Record<string, unknown>[]) => any[] };

const row = (overrides: Record<string, unknown>) => ({
  ID: 1, domain: 'example.com', keyword: 'alpha', country: 'US', location: '', device: 'desktop', history: '{}', tags: '[]', sticky: 0, ...overrides,
});

describe('keyword unique target migration', () => {
  it('plans nothing when every target is unique, including the same keyword in another city or device', () => {
    expect(planDuplicateRemovals([
      row({ ID: 1 }),
      row({ ID: 2, location: 'Austin,Texas,United States' }),
      row({ ID: 3, device: 'mobile' }),
      row({ ID: 4, domain: 'other.com' }),
    ])).toEqual([]);
  });

  it('keeps the row with the most history and merges tags and the star', () => {
    const [plan] = planDuplicateRemovals([
      row({ ID: 1, history: '{"2026-01-01":3}', tags: '["a"]' }),
      row({ ID: 2, history: '{"2026-01-01":3,"2026-01-02":2}', tags: '["B","a"]' }),
      row({ ID: 3, sticky: 1, tags: '["c"]' }),
    ]);

    expect(plan.keepID).toBe(2);
    expect(plan.deleteIDs.sort()).toEqual([1, 3]);
    expect(plan.tags).toEqual(['B', 'a', 'c']);
    expect(plan.sticky).toBe(true);
    expect(plan.tagsChanged).toBe(true);
    expect(plan.stickyChanged).toBe(true);
  });

  it('keeps the lowest ID when history sizes tie, and treats a null and an empty location as the same target', () => {
    const [plan] = planDuplicateRemovals([row({ ID: 9, location: null }), row({ ID: 4, location: '' })]);

    expect(plan.keepID).toBe(4);
    expect(plan.deleteIDs).toEqual([9]);
    expect(plan.tagsChanged).toBe(false);
  });

  it('ignores unreadable history and tags instead of failing', () => {
    const [plan] = planDuplicateRemovals([row({ ID: 1, history: 'oops', tags: 'oops' }), row({ ID: 2, history: null, tags: null })]);

    expect(plan.keepID).toBe(1);
    expect(plan.tags).toEqual([]);
  });

  it('runs the plan: merges rows, then creates the unique index, and skips when the table is missing', async () => {
    const calls: Array<{ sql: string, options?: any }> = [];
    const make = (tables: string[], rows: unknown[]) => ({
      sequelize: {
        constructor: { QueryTypes: { SELECT: 'SELECT' } },
        transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}),
        query: jest.fn(async (sql: string, options?: any) => {
          calls.push({ sql, options });
          if (sql.includes('sqlite_master')) { return [tables.map((name) => ({ name }))]; }
          if (sql.startsWith('SELECT ID')) { return rows; }
          return [{}];
        }),
      },
    });

    await migration.up({ context: make([], []) });
    expect(calls.some((call) => call.sql.includes('CREATE UNIQUE INDEX'))).toBe(false);

    calls.length = 0;
    await migration.up({ context: make(['keyword'], [row({ ID: 1 }), row({ ID: 2 })]) });
    expect(calls.find((call) => call.sql.startsWith('DELETE FROM keyword'))?.options.replacements).toEqual({ id: 2 });
    const createIndex = calls.find((call) => call.sql.includes('CREATE UNIQUE INDEX'));
    expect(createIndex?.sql).toContain("COALESCE(location, '')");
    expect(calls.findIndex((call) => call.sql.startsWith('DELETE'))).toBeLessThan(calls.findIndex((call) => call.sql.includes('CREATE UNIQUE INDEX')));
  });
});
