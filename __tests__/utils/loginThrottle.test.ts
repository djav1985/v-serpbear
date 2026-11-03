export {};

import { clearLoginFailures, isLoginLocked, recordLoginFailure, resetLoginThrottle } from '../../utils/loginThrottle';

describe('login throttle', () => {
  const userKey = [{ key: 'user:admin', maxFailures: 5 }];
  const start = 1_000_000;

  beforeEach(() => {
    resetLoginThrottle();
  });

  it('is not locked before the failure limit is reached', () => {
    for (let i = 0; i < 4; i += 1) {
      recordLoginFailure(userKey, start);
    }

    expect(isLoginLocked(userKey, start)).toBe(false);
  });

  it('locks the key once it reaches the limit, and unlocks after 15 minutes', () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure(userKey, start);
    }

    expect(isLoginLocked(userKey, start + 1000)).toBe(true);
    expect(isLoginLocked(userKey, start + 15 * 60 * 1000 + 1)).toBe(false);
  });

  it('starts a new window when the old one has expired', () => {
    for (let i = 0; i < 4; i += 1) {
      recordLoginFailure(userKey, start);
    }
    recordLoginFailure(userKey, start + 16 * 60 * 1000);

    expect(isLoginLocked(userKey, start + 16 * 60 * 1000)).toBe(false);
  });

  it('clears failures for its keys after a successful login', () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure(userKey, start);
    }

    clearLoginFailures(userKey);

    expect(isLoginLocked(userKey, start)).toBe(false);
  });

  it('counts keys separately, so one locked key does not lock another', () => {
    const attackerKeys = [{ key: 'user:admin', maxFailures: 5 }, { key: 'ip:10.0.0.9', maxFailures: 20 }];
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure([{ key: 'ip:10.0.0.9', maxFailures: 20 }], start);
    }
    recordLoginFailure(attackerKeys, start);

    expect(isLoginLocked([{ key: 'ip:10.0.0.10', maxFailures: 20 }], start)).toBe(false);
  });

  it('locks a client address after its higher limit is reached', () => {
    const ipKey = [{ key: 'ip:10.0.0.9', maxFailures: 20 }];
    for (let i = 0; i < 20; i += 1) {
      recordLoginFailure(ipKey, start);
    }

    expect(isLoginLocked(ipKey, start)).toBe(true);
  });
});
