export {};

import { readFileSync, writeFileSync } from 'fs';
import { getSessionVersion, revokeAllSessions, resetSessionVersionCache } from '../../utils/sessionStore';
import { atomicWriteFile } from '../../utils/atomicWrite';

jest.mock('fs', () => ({
  __esModule: true,
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  __esModule: true,
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/atomicWrite', () => ({
  __esModule: true,
  atomicWriteFile: jest.fn().mockResolvedValue(undefined),
}));

const readMock = readFileSync as unknown as jest.Mock;
const writeSyncMock = writeFileSync as unknown as jest.Mock;
const writeMock = atomicWriteFile as unknown as jest.Mock;

describe('sessionStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSessionVersionCache();
  });

  it('keeps the last known version when the file becomes unreadable', () => {
    readMock.mockReturnValueOnce('{"version":3}');
    expect(getSessionVersion()).toBe(3);

    readMock.mockImplementation(() => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); });
    expect(getSessionVersion()).toBe(3);

    readMock.mockReturnValue('not json');
    expect(getSessionVersion()).toBe(3);
  });

  it('uses the version written by logout even if the file cannot be read afterwards', async () => {
    readMock.mockReturnValueOnce('{"version":1}');
    await revokeAllSessions();

    readMock.mockImplementation(() => { throw new Error('gone'); });
    expect(getSessionVersion()).toBe(2);
  });

  it('reads the stored version', () => {
    readMock.mockReturnValue('{"version":3}');

    expect(getSessionVersion()).toBe(3);
  });

  it('generates and stores a non-zero version when the file is missing', () => {
    readMock.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });

    const version = getSessionVersion();

    expect(version).toBeGreaterThan(0);
    expect(writeSyncMock).toHaveBeenCalledWith(expect.stringMatching(/session\.json$/), JSON.stringify({ version }), 'utf-8');
    // Stays stable while the file is still missing
    expect(getSessionVersion()).toBe(version);
  });

  it('generates a non-zero version for a corrupt or negative value', () => {
    readMock.mockReturnValue('not json');
    expect(getSessionVersion()).toBeGreaterThan(0);

    resetSessionVersionCache();
    readMock.mockReturnValue('{"version":-2}');
    expect(getSessionVersion()).toBeGreaterThan(0);
  });

  it('does not overwrite the file on a transient read error', () => {
    readMock.mockImplementation(() => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); });

    expect(getSessionVersion()).toBeGreaterThan(0);
    expect(writeSyncMock).not.toHaveBeenCalled();
  });

  it('moves the version forward and stores it on logout', async () => {
    readMock.mockReturnValue('{"version":3}');

    await expect(revokeAllSessions()).resolves.toBe(4);

    expect(writeMock).toHaveBeenCalledWith(expect.stringMatching(/session\.json$/), '{"version":4}', 'utf-8');
  });

  it('moves past a freshly generated version on logout', async () => {
    readMock.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });
    const first = getSessionVersion();

    await expect(revokeAllSessions()).resolves.toBe(first + 1);
  });
});
