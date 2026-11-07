/* eslint-disable security/detect-non-literal-fs-filename -- reads and writes only a temp directory created by the test */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import {
   deleteThumbnails,
   ensureThumbnails,
   generateThumbnail,
   isSafeThumbnailDomain,
   isThumbnailStale,
   listThumbnails,
   resetThumbnailState,
} from '../../utils/thumbnails';

const ORIGINAL_CWD = process.cwd();
const NOW = Date.parse('2026-11-07T12:00:00Z');

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

const streamBody = (chunks: Uint8Array[]) => ({
   getReader: () => ({
      read: (() => {
         let index = 0;
         return async () => (index < chunks.length
            ? { done: false, value: chunks[index++] }
            : { done: true, value: undefined });
      })(),
      cancel: async () => undefined,
      releaseLock: () => undefined,
   }),
});

const imageResponse = () => ({
   status: 200,
   headers: headers({ 'content-type': 'image/jpeg', 'cache-control': 'max-age=86400' }),
   body: streamBody([new Uint8Array([1, 2, 3])]),
});

// What thum.io answers while it is still generating a screenshot
const placeholderResponse = () => ({
   status: 200,
   headers: headers({ 'content-type': 'image/gif', 'cache-control': 'no-cache, no-store, must-revalidate' }),
   body: streamBody([new Uint8Array([9, 9])]),
});

const oversizedImageResponse = (cancel: jest.Mock) => ({
   status: 200,
   headers: headers({ 'content-type': 'image/jpeg', 'cache-control': 'max-age=86400' }),
   body: {
      getReader: () => ({
         read: async () => ({ done: false, value: new Uint8Array((2 * 1024 * 1024) + 1) }),
         cancel,
         releaseLock: () => undefined,
      }),
   },
});

describe('thumbnails', () => {
   let workDir: string;
   let thumbDir: string;
   const originalFetch = global.fetch;

   beforeEach(() => {
      workDir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-thumbs-'));
      thumbDir = path.join(workDir, 'data', 'thumbnails');
      mkdirSync(thumbDir, { recursive: true });
      process.chdir(workDir);
      resetThumbnailState();
      jest.spyOn(console, 'log').mockImplementation();
   });

   afterEach(() => {
      process.chdir(ORIGINAL_CWD);
      global.fetch = originalFetch;
      jest.useRealTimers();
      jest.restoreAllMocks();
      rmSync(workDir, { recursive: true, force: true });
   });

   const names = () => readdirSync(thumbDir).sort();
   const settle = async () => { await new Promise((resolve) => { setImmediate(resolve); }); };

   it('only accepts file-safe host names', () => {
      expect(isSafeThumbnailDomain('example.com')).toBe(true);
      expect(isSafeThumbnailDomain('xn--bcher-kva.example')).toBe(true);
      ['', '../etc', 'a/b', 'a b', '.example.com', 'example..com', 'EXAMPLE.com', 42].forEach((value) => {
         expect(isSafeThumbnailDomain(value)).toBe(false);
      });
   });

   it('calls a thumbnail stale after 30 days', () => {
      expect(isThumbnailStale('2026-10-09', NOW)).toBe(false);
      expect(isThumbnailStale('2026-10-08', NOW)).toBe(true);
      expect(isThumbnailStale('not-a-date', NOW)).toBe(true);
   });

   it('lists the newest thumbnail of each domain and ignores other files', async () => {
      ['example.com_2026-09-01.jpg', 'example.com_2026-11-01.jpg', 'other.org_2026-10-10.jpg', 'notes.txt', 'example.com_2026-11-02.jpg.tmp.ab'].forEach((file) => {
         writeFileSync(path.join(thumbDir, file), 'x');
      });

      const found = await listThumbnails();

      expect(found.get('example.com')?.date).toBe('2026-11-01');
      expect(found.get('other.org')?.date).toBe('2026-10-10');
      expect(found.size).toBe(2);
      // The version adds the file's write time to its date
      expect(found.get('example.com')?.version).toMatch(/^2026-11-01-\d+$/);
   });

   it('gives a thumbnail regenerated on the same day a new version', async () => {
      const today = new Date().toISOString().slice(0, 10);
      global.fetch = jest.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch;
      await generateThumbnail('example.com');
      const first = (await listThumbnails()).get('example.com')?.version;
      // Back-date the saved file so its write time is clearly different
      const saved = path.join(thumbDir, `example.com_${today}.jpg`);
      utimesSync(saved, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
      const backdated = (await listThumbnails()).get('example.com')?.version;
      await generateThumbnail('example.com');
      const regenerated = (await listThumbnails()).get('example.com')?.version;

      expect(backdated).not.toBe(first);
      expect(regenerated).not.toBe(backdated);
      expect(regenerated?.startsWith(today)).toBe(true);
   });

   it('saves a generated thumbnail under the domain and the date, and deletes the old one afterwards', async () => {
      writeFileSync(path.join(thumbDir, 'example.com_2026-01-01.jpg'), 'old');
      writeFileSync(path.join(thumbDir, 'other.org_2026-01-01.jpg'), 'keep');
      global.fetch = jest.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch;
      const today = new Date().toISOString().slice(0, 10);

      await expect(generateThumbnail('example.com')).resolves.toBe(true);

      expect(names()).toEqual([`example.com_${today}.jpg`, 'other.org_2026-01-01.jpg']);
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://image.thum.io/get/'), expect.anything());
   });

   it('keeps the old thumbnail when no screenshot can be made', async () => {
      jest.useFakeTimers();
      writeFileSync(path.join(thumbDir, 'example.com_2026-01-01.jpg'), 'old');
      global.fetch = jest.fn().mockResolvedValue(placeholderResponse()) as unknown as typeof fetch;

      const job = generateThumbnail('example.com');
      await jest.advanceTimersByTimeAsync(60_000);

      await expect(job).resolves.toBe(false);
      expect(names()).toEqual(['example.com_2026-01-01.jpg']);
      // 4 attempts, 10 seconds apart
      expect(global.fetch).toHaveBeenCalledTimes(4);
   });

   it('cancels an image response as soon as it exceeds the byte limit', async () => {
      jest.useFakeTimers();
      const cancel = jest.fn().mockResolvedValue(undefined);
      global.fetch = jest.fn().mockImplementation(() => oversizedImageResponse(cancel)) as unknown as typeof fetch;

      const job = generateThumbnail('large.com');
      await jest.advanceTimersByTimeAsync(60_000);

      await expect(job).resolves.toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(4);
      expect(cancel).toHaveBeenCalledTimes(4);
      expect(names()).toEqual([]);
   });

   it('asks again while thum.io is still generating, then saves the real screenshot', async () => {
      jest.useFakeTimers();
      global.fetch = jest.fn()
         .mockResolvedValueOnce(placeholderResponse())
         .mockResolvedValueOnce(imageResponse()) as unknown as typeof fetch;

      const job = generateThumbnail('example.com');
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(job).resolves.toBe(true);
      expect(names()).toHaveLength(1);
   });

   it('starts generation only for missing or stale thumbnails, and not twice for the same domain', async () => {
      writeFileSync(path.join(thumbDir, 'fresh.com_2026-11-01.jpg'), 'x');
      writeFileSync(path.join(thumbDir, 'stale.com_2026-08-01.jpg'), 'x');
      global.fetch = jest.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch;

      await ensureThumbnails(['fresh.com', 'stale.com', 'missing.com', 'missing.com'], NOW);
      await settle();
      await generateThumbnail('stale.com');

      // thum.io is asked for https://image.thum.io/get/<options>/<website>; compare the website part exactly
      const requested = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url).split('/width/200/')[1]);
      expect(requested).not.toContain('https://fresh.com');
      expect(requested.filter((target) => target === 'https://missing.com')).toHaveLength(1);
      expect(requested).toContain('https://stale.com');
   });

   it('leaves a domain alone for a while after a failed generation', async () => {
      jest.useFakeTimers();
      global.fetch = jest.fn().mockResolvedValue(placeholderResponse()) as unknown as typeof fetch;
      const first = generateThumbnail('broken.com');
      await jest.advanceTimersByTimeAsync(60_000);
      await first;
      (global.fetch as jest.Mock).mockClear();

      await ensureThumbnails(['broken.com'], Date.now());
      await jest.advanceTimersByTimeAsync(60_000);

      expect(global.fetch).not.toHaveBeenCalled();
   });

   it('deletes every thumbnail of one domain only', async () => {
      ['gone.com_2026-01-01.jpg', 'gone.com_2026-02-01.jpg', 'stays.com_2026-01-01.jpg'].forEach((file) => {
         writeFileSync(path.join(thumbDir, file), 'x');
      });

      await deleteThumbnails('gone.com');

      expect(names()).toEqual(['stays.com_2026-01-01.jpg']);
   });
});
