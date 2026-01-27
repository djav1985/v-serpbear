import { fromDbBool, toDbBool } from '../../utils/dbBooleans';

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
});
