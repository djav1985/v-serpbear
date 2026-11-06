export {};

import { readFile, writeFile, rename } from 'fs/promises';
import { reserveEmailSend } from '../../utils/emailThrottle';

// An in-memory stand-in for the throttle file, so the reservation can be checked against what is saved
const files = new Map<string, string>();

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  rename: jest.fn(),
}));

const readMock = readFile as unknown as jest.Mock;
const writeMock = writeFile as unknown as jest.Mock;
const renameMock = rename as unknown as jest.Mock;

const saved = (): Record<string, { lastSent: string; count: number }> => JSON.parse(files.get('throttle') ?? '{}');

describe('reserveEmailSend', () => {
  beforeEach(() => {
    files.clear();
    jest.clearAllMocks();
    readMock.mockImplementation(async () => {
      const content = files.get('throttle');
      if (content === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return content;
    });
    writeMock.mockImplementation(async (_path: string, data: string) => { files.set('throttle-tmp', data); });
    renameMock.mockImplementation(async () => { files.set('throttle', files.get('throttle-tmp') as string); });
  });

  it('reserves the send and records it before the email is sent', async () => {
    const reservation = await reserveEmailSend('example.com');

    expect(reservation.reserved).toBe(true);
    expect(saved()['example.com'].count).toBe(1);
  });

  it('refuses a second send for the same domain within the minimum interval', async () => {
    await reserveEmailSend('example.com');

    const second = await reserveEmailSend('example.com');

    expect(second.reserved).toBe(false);
    expect(second.reason).toMatch(/Minimum interval/);
    expect(saved()['example.com'].count).toBe(1);
  });

  it('gives the slot back when the send fails, so the next send is allowed', async () => {
    const failed = await reserveEmailSend('example.com');
    await failed.release();

    expect(saved()).toEqual({});
    expect((await reserveEmailSend('example.com')).reserved).toBe(true);
  });

  it('restores the previous entry on release, not an empty one', async () => {
    const earlier = { 'example.com': { lastSent: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), count: 3 } };
    files.set('throttle', JSON.stringify(earlier));

    const reservation = await reserveEmailSend('example.com');
    expect(saved()['example.com'].count).toBe(1);
    await reservation.release();

    expect(saved()['example.com'].count).toBe(3);
  });

  it('does not write when the cache cannot be read, so other domains keep their state', async () => {
    const earlier = { 'other.com': { lastSent: new Date().toISOString(), count: 2 } };
    files.set('throttle', JSON.stringify(earlier));
    readMock.mockRejectedValue(Object.assign(new Error('busy'), { code: 'EBUSY' }));

    const reservation = await reserveEmailSend('example.com');

    expect(reservation.reserved).toBe(false);
    expect(writeMock).not.toHaveBeenCalled();
    expect(saved()).toEqual(earlier);
  });

  it('starts from an empty cache when the file holds invalid JSON', async () => {
    files.set('throttle', '{not json');

    const reservation = await reserveEmailSend('example.com');

    expect(reservation.reserved).toBe(true);
    expect(saved()['example.com'].count).toBe(1);
  });

  it('does not send when saving the reservation fails, and release does not throw', async () => {
    writeMock.mockRejectedValue(new Error('disk full'));

    const reservation = await reserveEmailSend('example.com');

    expect(reservation.reserved).toBe(false);
    await expect(reservation.release()).resolves.toBeUndefined();
  });
});
