import { nextMapPackRemovedAt } from '../../utils/mapPack';

const base = { wasInMapPack: false, isInMapPack: false, removedAt: null, todayKey: '2026-11-10', supportsMapPack: true };

describe('nextMapPackRemovedAt', () => {
  it('sets, keeps and clears the removal date by the rules', () => {
    // in the map pack: cleared
    expect(nextMapPackRemovedAt({ ...base, wasInMapPack: true, isInMapPack: true, removedAt: '2026-11-01' })).toBeNull();
    expect(nextMapPackRemovedAt({ ...base, isInMapPack: true, removedAt: '2026-11-01' })).toBeNull();
    // dropped out now: today
    expect(nextMapPackRemovedAt({ ...base, wasInMapPack: true })).toBe('2026-11-10');
    // already out: kept for 30 days, cleared after
    expect(nextMapPackRemovedAt({ ...base, removedAt: '2026-11-01' })).toBe('2026-11-01');
    expect(nextMapPackRemovedAt({ ...base, removedAt: '2026-10-11' })).toBe('2026-10-11');
    expect(nextMapPackRemovedAt({ ...base, removedAt: '2026-10-10' })).toBeNull();
    // unreadable date cleared, no date stays empty
    expect(nextMapPackRemovedAt({ ...base, removedAt: 'nonsense' })).toBeNull();
    expect(nextMapPackRemovedAt(base)).toBeNull();
    // scrapers without map pack data change nothing
    expect(nextMapPackRemovedAt({ ...base, supportsMapPack: false, wasInMapPack: true })).toBeNull();
    expect(nextMapPackRemovedAt({ ...base, supportsMapPack: false, removedAt: '2026-01-01' })).toBe('2026-01-01');
  });
});
