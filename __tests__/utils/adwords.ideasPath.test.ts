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

describe('ideas file access only accepts real domain names', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses to read an unsafe domain without touching the file system', async () => {
    for (const domain of ['../settings', 'example/../../x', 'my_site-com.com', 'a b', '%2e%2e', '']) {
      await expect(getLocalKeywordIdeas(domain)).resolves.toBe(false);
    }
    expect(readMock).not.toHaveBeenCalled();
  });

  it('refuses to write for a path-like domain', async () => {
    await expect(updateLocalKeywordIdeas('../settings', { favorites: [] })).resolves.toBe(false);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('reads the ideas file of a hyphenated domain under its real name', async () => {
    readMock.mockResolvedValue(JSON.stringify({ keywords: [{ uid: 'k1' }] }));

    const result = await getLocalKeywordIdeas('my-site.com');

    expect(readMock).toHaveBeenCalledWith(expect.stringMatching(/IDEAS_my-site\.com\.json$/), expect.anything());
    expect(result).toEqual({ keywords: [{ uid: 'k1' }] });
  });
});
