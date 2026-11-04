export {};

import { readFileSync } from 'fs';
import { getSessionVersion, revokeAllSessions, resetSessionVersionCache } from '../../utils/sessionStore';
import { atomicWriteFile } from '../../utils/atomicWrite';

jest.mock('fs', () => ({
  __esModule: true,
  readFileSync: jest.fn(),
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

  it('treats a missing file as version 0', () => {
    readMock.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });

    expect(getSessionVersion()).toBe(0);
  });

  it('treats a corrupt or negative value as version 0', () => {
    readMock.mockReturnValue('not json');
    expect(getSessionVersion()).toBe(0);

    readMock.mockReturnValue('{"version":-2}');
    expect(getSessionVersion()).toBe(0);
  });

  it('moves the version forward and stores it on logout', async () => {
    readMock.mockReturnValue('{"version":3}');

    await expect(revokeAllSessions()).resolves.toBe(4);

    expect(writeMock).toHaveBeenCalledWith(expect.stringMatching(/session\.json$/), '{"version":4}', 'utf-8');
  });

  it('starts at version 1 when no version was stored before', async () => {
    readMock.mockImplementation(() => { throw new Error('missing'); });

    await expect(revokeAllSessions()).resolves.toBe(1);
  });
});
