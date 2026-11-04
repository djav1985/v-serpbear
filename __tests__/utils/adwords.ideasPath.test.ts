export {};

import { readFile, writeFile } from 'fs/promises';
import { getLocalKeywordIdeas, updateLocalKeywordIdeas } from '../../utils/adwords';

jest.mock('fs/promises', () => ({
  __esModule: true,
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

const readMock = readFile as unknown as jest.Mock;
const writeMock = writeFile as unknown as jest.Mock;

describe('ideas file access only accepts domain slugs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['../settings', 'example/../../x', 'a.b', 'a b', '%2e%2e', ''])('refuses to read for %p without touching the file system', async (domain) => {
    await expect(getLocalKeywordIdeas(domain)).resolves.toBe(false);
    expect(readMock).not.toHaveBeenCalled();
  });

  it('refuses to write for a path-like domain', async () => {
    await expect(updateLocalKeywordIdeas('../settings', { favorites: [] })).resolves.toBe(false);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('reads the ideas file of a hyphenated domain under its real name', async () => {
    readMock.mockResolvedValue(JSON.stringify({ keywords: [{ uid: 'k2' }] }));

    await getLocalKeywordIdeas('my_site-com');

    expect(readMock).toHaveBeenCalledWith(expect.stringMatching(/IDEAS_my-site\.com\.json$/), expect.anything());
  });

  it('still reads a valid slug', async () => {
    readMock.mockResolvedValue(JSON.stringify({ keywords: [{ uid: 'k1' }] }));

    const result = await getLocalKeywordIdeas('my-site_com');

    expect(readMock).toHaveBeenCalledWith(expect.stringMatching(/IDEAS_my\.site-com\.json$/), expect.anything());
    expect(result).toEqual({ keywords: [{ uid: 'k1' }] });
  });
});
