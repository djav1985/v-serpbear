import { fromDbBool, toDbBool, normalizeToBoolean } from '../../utils/dbBooleans';

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
    it('handles boolean values directly', () => {
      expect(normalizeToBoolean(true)).toBe(true);
      expect(normalizeToBoolean(false)).toBe(false);
    });

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
      expect(normalizeToBoolean('  1  ')).toBe(true);
      expect(normalizeToBoolean('  false  ')).toBe(false);
      expect(normalizeToBoolean('  0  ')).toBe(false);
      expect(normalizeToBoolean('   ')).toBe(false);
    });

    it('handles null and undefined', () => {
      expect(normalizeToBoolean(null)).toBe(false);
      expect(normalizeToBoolean(undefined)).toBe(false);
    });

    it('uses conservative approach for unrecognized values (returns false)', () => {
      // Unrecognized strings should be treated as false for safety
      expect(normalizeToBoolean('yes')).toBe(false);
      expect(normalizeToBoolean('no')).toBe(false);
      expect(normalizeToBoolean('error')).toBe(false);
      expect(normalizeToBoolean('timeout')).toBe(false);
      expect(normalizeToBoolean('API Error')).toBe(false);
      // Objects and arrays should also be false
      expect(normalizeToBoolean([])).toBe(false);
      expect(normalizeToBoolean({})).toBe(false);
    });
  });
});
