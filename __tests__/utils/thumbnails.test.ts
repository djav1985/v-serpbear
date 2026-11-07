/* eslint-disable security/detect-non-literal-fs-filename -- reads and writes only a temp directory created by the test */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import Domain from '../../database/models/domain';
import {
   deleteThumbnails,
   ensureThumbnails,
   generateThumbnail,
   getThumbnailById,
   initializeThumbnailIndex,
   isSafeThumbnailDomain,
   isThumbnailStale,
   listThumbnails,
   resetThumbnailState,
} from '../../utils/thumbnails';

jest.mock('../../database/models/domain', () => ({
   __esModule: true,
   default: {
      findOne: jest.fn(({ where }) => ({ ID: where.domain === 'example.com' ? 1 : 21 })),
      findAll: jest.fn(),
   },
}));
jest.mock('../../database/init', () => ({ initializeDatabase: jest.fn() }));
jest.mock('../../utils/brandingAssets', () => ({ ensureBrandingAssets: jest.fn() }));
jest.mock('croner', () => ({ Cron: jest.fn() }));

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_NEXT_RUNTIME = process.env.NEXT_RUNTIME;
const ORIGINAL_NEXT_PHASE = process.env.NEXT_PHASE;
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
      if (ORIGINAL_NEXT_RUNTIME === undefined) { delete process.env.NEXT_RUNTIME; } else { process.env.NEXT_RUNTIME = ORIGINAL_NEXT_RUNTIME; }
      if (ORIGINAL_NEXT_PHASE === undefined) { delete process.env.NEXT_PHASE; } else { process.env.NEXT_PHASE = ORIGINAL_NEXT_PHASE; }
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
      expect(isThumbnailStale('2026-10-09', NOW)).toBe(false);
      expect(isThumbnailStale('2026-10-08', NOW)).toBe(true);
      expect(isThumbnailStale('not-a-date', NOW)).toBe(true);
      const generatedAt = Date.parse('2026-10-01T08:30:00Z');
      expect(isThumbnailStale(generatedAt, generatedAt + (30 * 24 * 60 * 60 * 1000) - 1)).toBe(false);
      expect(isThumbnailStale(generatedAt, generatedAt + (30 * 24 * 60 * 60 * 1000))).toBe(true);
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
      // Regeneration on the same date still changes the file modification time and URL version.
      const today = new Date().toISOString().slice(0, 10);
      global.fetch = jest.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch;
      await generateThumbnail('example.com', 1);
      const first = (await listThumbnails()).get('example.com')?.version;
      // Back-date the saved file so its write time is clearly different
      const saved = path.join(thumbDir, getThumbnailById(1)?.file || 'missing.jpg');
      utimesSync(saved, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
      const backdated = (await listThumbnails()).get('example.com')?.version;
      await generateThumbnail('example.com', 1);
      const regenerated = (await listThumbnails()).get('example.com')?.version;

      expect(backdated).not.toBe(first);
      expect(regenerated).not.toBe(backdated);
      expect(regenerated?.startsWith(today)).toBe(true);
   });

   it('saves a generated thumbnail under the domain and the date, and deletes the old one afterwards', async () => {
      writeFileSync(path.join(thumbDir, 'example.com_2026-01-01.jpg'), 'old');
      writeFileSync(path.join(thumbDir, 'other.org_2026-01-01.jpg'), 'keep');
      const today = new Date().toISOString().slice(0, 10);
      const sameDayFile = `example.com_${today}.jpg`;
      writeFileSync(path.join(thumbDir, sameDayFile), 'old same-day image');
      writeFileSync(path.join(thumbDir, `${sameDayFile}.meta.json`), JSON.stringify({ contentType: 'image/webp' }));
      await initializeThumbnailIndex([{ ID: 1, domain: 'example.com' }]);
      global.fetch = jest.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch;

      const saved = await generateThumbnail('example.com', 1);
      expect(saved).toMatchObject({
         ID: 1,
         domain: 'example.com',
         contentType: 'image/jpeg',
      });

      expect(saved?.file).not.toBe(sameDayFile);
      expect(names()).toContain(saved?.file);
      expect(names()).toContain(`${saved?.file}.meta.json`);
      expect(names()).not.toContain(sameDayFile);
      expect(names()).toContain('other.org_2026-01-01.jpg');
      expect(getThumbnailById(1)).toMatchObject({ file: saved?.file, generatedAt: expect.any(Number) });
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://image.thum.io/get/'), expect.anything());
   });

   it('keeps an old image on failure, enforces the size limit, and retries a generating placeholder', async () => {
      jest.useFakeTimers();
      writeFileSync(path.join(thumbDir, 'example.com_2026-01-01.jpg'), 'old');
      const cancel = jest.fn().mockResolvedValue(undefined);
      const fetchMock: jest.Mock = jest.fn();
      fetchMock.mockImplementation((url: string) => {
         if (url.includes('/large.com')) { return Promise.resolve(oversizedImageResponse(cancel)); }
         if (url.includes('/retry.com')) {
            return Promise.resolve(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/retry.com')).length === 1
               ? placeholderResponse() : imageResponse());
         }
         return Promise.resolve(placeholderResponse());
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const job = generateThumbnail('example.com', 1);
      await jest.advanceTimersByTimeAsync(60_000);

      await expect(job).resolves.toBeUndefined();
      expect(names()).toEqual(['example.com_2026-01-01.jpg']);
      // 4 attempts, 10 seconds apart
      expect(global.fetch).toHaveBeenCalledTimes(4);
      (global.fetch as jest.Mock).mockClear();
      await ensureThumbnails([{ ID: 1, domain: 'example.com' }], Date.now());
      await generateThumbnail('example.com', 1);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(global.fetch).not.toHaveBeenCalled();

      const largeJob = generateThumbnail('large.com', 21);
      await jest.advanceTimersByTimeAsync(60_000);
      await expect(largeJob).resolves.toBeUndefined();
      expect(cancel).toHaveBeenCalledTimes(4);

      const retryJob = generateThumbnail('retry.com', 21);
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(retryJob).resolves.toMatchObject({ ID: 21 });
      expect(names().filter((file) => file.endsWith('.jpg')).some((file) => file.startsWith(`retry.com_${new Date().toISOString().slice(0, 10)}_`))).toBe(true);
   });

   it('starts generation only for missing or stale thumbnails, and not twice for the same domain', async () => {
      const freshFile = path.join(thumbDir, 'fresh.com_2026-11-01.jpg');
      const staleFile = path.join(thumbDir, 'stale.com_2026-08-01.jpg');
      writeFileSync(freshFile, 'x');
      writeFileSync(staleFile, 'x');
      utimesSync(freshFile, new Date(NOW - (5 * 24 * 60 * 60 * 1000)), new Date(NOW - (5 * 24 * 60 * 60 * 1000)));
      utimesSync(staleFile, new Date(NOW - (35 * 24 * 60 * 60 * 1000)), new Date(NOW - (35 * 24 * 60 * 60 * 1000)));
      global.fetch = jest.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch;
      await initializeThumbnailIndex([
         { ID: 10, domain: 'fresh.com' },
         { ID: 21, domain: 'stale.com' },
      ]);

      await ensureThumbnails([
         { ID: 10, domain: 'fresh.com' },
         { ID: 21, domain: 'stale.com' },
         { ID: 22, domain: 'missing.com' },
         { ID: 22, domain: 'missing.com' },
      ], NOW);
      await settle();
      await generateThumbnail('stale.com', 21);

      // thum.io is asked for https://image.thum.io/get/<options>/<website>; compare the website part exactly
      const requested = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url).split('/width/200/')[1]);
      expect(requested).not.toContain('https://fresh.com');
      expect(requested.filter((target) => target === 'https://missing.com')).toHaveLength(1);
      expect(requested).toContain('https://stale.com');
   });

   it('initializes only tracked ID entries and evicts them when their domain is deleted', async () => {
      writeFileSync(path.join(thumbDir, 'tracked.com_2026-11-01.jpg'), 'old');
      writeFileSync(path.join(thumbDir, 'tracked.com_2026-11-02.jpg'), 'new');
      writeFileSync(path.join(thumbDir, 'tracked.com_2026-11-02.jpg.meta.json'), JSON.stringify({ contentType: 'image/webp' }));
      writeFileSync(path.join(thumbDir, 'untracked.com_2026-11-03.jpg'), 'ignored');
      writeFileSync(path.join(thumbDir, 'gone.com_2026-11-01.jpg'), 'image');
      writeFileSync(path.join(thumbDir, 'gone.com_2026-11-02.jpg'), 'image');
      writeFileSync(path.join(thumbDir, 'stays.com_2026-11-01.jpg'), 'keep');

      await initializeThumbnailIndex([{ ID: 7, domain: 'tracked.com' }, { ID: 12, domain: 'gone.com' }]);

      expect(getThumbnailById(7)).toMatchObject({
         ID: 7,
         domain: 'tracked.com',
         file: 'tracked.com_2026-11-02.jpg',
         contentType: 'image/webp',
      });
      expect(getThumbnailById(8)).toBeUndefined();
      await deleteThumbnails('gone.com');
      expect(getThumbnailById(12)).toBeUndefined();
      expect(names()).toEqual(['stays.com_2026-11-01.jpg', 'tracked.com_2026-11-01.jpg', 'tracked.com_2026-11-02.jpg', 'tracked.com_2026-11-02.jpg.meta.json', 'untracked.com_2026-11-03.jpg']);
   });

   it('joins concurrent generations and indexes only the row ID that requested the work', async () => {
      let resolveScreenshot: ((value: ReturnType<typeof imageResponse>) => void) | undefined;
      global.fetch = jest.fn(() => new Promise((resolve) => { resolveScreenshot = resolve; })) as unknown as typeof fetch;
      const first = generateThumbnail('shared.com', 21);
      const second = generateThumbnail('shared.com', 21);
      await Promise.resolve();

      resolveScreenshot?.(imageResponse());

      const [a, b] = await Promise.all([first, second]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(a).toEqual(b);
      expect(a).toMatchObject({ ID: 21, domain: 'shared.com' });
      expect(getThumbnailById(21)).toEqual(a);

      (Domain as unknown as { findOne: jest.Mock }).findOne.mockResolvedValueOnce({ ID: 99 });
      global.fetch = jest.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch;
      await expect(generateThumbnail('recreated.com', 21)).resolves.toBeUndefined();
      expect(getThumbnailById(21)?.domain).toBe('shared.com');
      expect(names().some((file) => file.startsWith('recreated.com_'))).toBe(false);

      (Domain as unknown as { findOne: jest.Mock }).findOne.mockImplementation(() => ({ ID: 99 }));
      const pendingResponses: Array<(value: ReturnType<typeof imageResponse>) => void> = [];
      const raceFetch = jest.fn(() => new Promise((resolve) => { pendingResponses.push(resolve); }));
      global.fetch = raceFetch as unknown as typeof fetch;
      const deletedRowJob = generateThumbnail('race.com', 21);
      await Promise.resolve();
      const recreatedRowJob = generateThumbnail('race.com', 99);
      await Promise.resolve();
      pendingResponses.forEach((resolve) => resolve(imageResponse()));
      const [deletedResult, recreatedResult] = await Promise.all([deletedRowJob, recreatedRowJob]);
      expect(raceFetch).toHaveBeenCalledTimes(2);
      expect(deletedResult).toBeUndefined();
      expect(recreatedResult).toMatchObject({ ID: 99, domain: 'race.com' });
   });

   it('initializes after the database and registers only one daily sweep across repeated startup', async () => {
      const events: string[] = [];
      const startupGlobal = globalThis as typeof globalThis & { __serpbearThumbnailStartup?: { promise?: Promise<void>; job?: unknown } };
      delete startupGlobal.__serpbearThumbnailStartup;
      const { initializeDatabase } = await import('../../database/init');
      (initializeDatabase as jest.Mock).mockImplementation(async () => { events.push('database'); });
      (Domain as unknown as { findAll: jest.Mock }).findAll.mockImplementation(async () => {
         events.push('domains');
         return [{ ID: 31, domain: 'startup.com' }];
      });
      const startupImage = path.join(thumbDir, 'startup.com_2026-11-07.jpg');
      writeFileSync(startupImage, 'startup image');
      utimesSync(startupImage, new Date(NOW - (35 * 24 * 60 * 60 * 1000)), new Date(NOW - (35 * 24 * 60 * 60 * 1000)));
      global.fetch = jest.fn().mockResolvedValue(imageResponse()) as unknown as typeof fetch;
      const { Cron } = await import('croner');
      (Cron as unknown as jest.Mock).mockImplementation(() => {
         events.push(getThumbnailById(31) ? 'cron' : 'cron-before-index');
         return {};
      });
      process.env.NEXT_RUNTIME = 'nodejs';
      delete process.env.NEXT_PHASE;

      const { register } = await import('../../instrumentation');
      await register();
      await register();
      await settle();

      expect(events).toEqual(['database', 'domains', 'cron']);
      expect(getThumbnailById(31)?.domain).toBe('startup.com');
      expect(global.fetch).toHaveBeenCalledTimes(1);
   });

   it('shares the initialized thumbnail index across independently loaded server bundles', async () => {
      const file = 'example.com_2026-11-07_1794052800000-0123456789abcdef.jpg';
      writeFileSync(path.join(thumbDir, file), 'image bytes');
      writeFileSync(path.join(thumbDir, `${file}.meta.json`), JSON.stringify({ contentType: 'image/jpeg' }));
      await initializeThumbnailIndex([{ ID: 1, domain: 'example.com' }]);

      jest.resetModules();
      const secondBundle = await import('../../utils/thumbnails');

      expect(secondBundle.getThumbnailById(1)).toMatchObject({
         ID: 1,
         domain: 'example.com',
         file,
      });
      secondBundle.resetThumbnailState();
   });
});
