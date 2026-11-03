export {};

import { toHistoryDateKey } from '../../utils/historyDateKey';
import migration from '../../database/migrations/1773000000000-pad-history-date-keys.js';

const { padHistoryDateKeys } = migration as unknown as { padHistoryDateKeys: (history: Record<string, number>) => Record<string, number> };

describe('history date key padding', () => {
  it('pads single-digit month and day keys', () => {
    expect(padHistoryDateKeys({ '2026-1-5': 3, '2026-11-12': 4 })).toEqual({ '2026-01-05': 3, '2026-11-12': 4 });
  });

  it('leaves already padded keys unchanged', () => {
    expect(padHistoryDateKeys({ '2026-01-05': 3 })).toEqual({ '2026-01-05': 3 });
  });

  it('keeps the padded entry when both forms of the same day exist', () => {
    expect(padHistoryDateKeys({ '2026-1-5': 9, '2026-01-05': 2 })).toEqual({ '2026-01-05': 2 });
    expect(padHistoryDateKeys({ '2026-01-05': 2, '2026-1-5': 9 })).toEqual({ '2026-01-05': 2 });
  });

  it('gives the same key the app writes for the same calendar day', () => {
    const day = new Date(2026, 0, 5, 12, 0, 0);
    const legacyKey = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;

    expect(padHistoryDateKeys({ [legacyKey]: 7 })).toEqual({ [toHistoryDateKey(day)]: 7 });
  });
});
