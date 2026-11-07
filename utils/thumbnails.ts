import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import path from 'path';
import { logger } from './logger';

/**
 * Website thumbnails for the domain list. The server fetches a screenshot from thum.io, saves it in
 * data/thumbnails as <domain>_<YYYY-MM-DD>.jpg (the date it was generated) and serves it from there.
 * A missing thumbnail is generated in the background; one older than 30 days is regenerated while the old image is
 * still served, and the old file is deleted only once the new one is saved.
 */

export const THUMBNAIL_MAX_AGE_DAYS = 30;
const GENERATION_ATTEMPTS = 4;
const RETRY_DELAY_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_GENERATIONS = 3;
// After a failed generation the domain is left alone for an hour, so a site that cannot be captured is not requested on every page load
const FAILURE_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;
const FILE_PATTERN = /^(.+)_(\d{4}-\d{2}-\d{2})\.jpg$/;
// Domains are validated as host names when they are added; this is a second check because the name becomes a file name
const SAFE_DOMAIN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/**
 * date is the day in the file name and decides when the thumbnail is old. version changes every time the file is
 * written (it adds the file's modification time), so an image regenerated on the same day still gets a new address.
 */
export type ThumbnailInfo = { domain: string; date: string; file: string; version: string };

export const getThumbnailDir = (): string => path.join(process.cwd(), 'data', 'thumbnails');

/**
 * The full path of a file inside the thumbnails folder. Only the file's own name is used, and a name that would
 * resolve outside the folder is refused, so a domain can never reach another directory.
 */
const insideThumbnailDir = (fileName: string): string => {
   const dir = path.resolve(getThumbnailDir());
   const resolved = path.resolve(dir, path.basename(fileName));
   if (!resolved.startsWith(dir + path.sep)) {
      throw new Error('Thumbnail path is outside the thumbnails folder');
   }
   return resolved;
};

export const isSafeThumbnailDomain = (domain: unknown): domain is string => (
   typeof domain === 'string' && domain.length <= 253 && SAFE_DOMAIN.test(domain) && !domain.includes('..')
);

const todayStamp = (now: number = Date.now()): string => new Date(now).toISOString().slice(0, 10);

export const isThumbnailStale = (date: string, now: number = Date.now()): boolean => {
   const generated = Date.parse(`${date}T00:00:00Z`);
   return !Number.isFinite(generated) || (now - generated) / DAY_MS > THUMBNAIL_MAX_AGE_DAYS;
};

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** Newest thumbnail of every domain that has one, from a single read of the thumbnails folder */
export const listThumbnails = async (): Promise<Map<string, ThumbnailInfo>> => {
   const newest = new Map<string, ThumbnailInfo>();
   let names: string[] = [];
   try {
      // The folder is data/thumbnails, never built from a request.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      names = await readdir(getThumbnailDir());
   } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
         logger.error('Could not read the thumbnails folder', error instanceof Error ? error : new Error(String(error)));
      }
      return newest;
   }
   for (const file of names) {
      const match = FILE_PATTERN.exec(file);
      if (!match) { continue; }
      const [, domain, date] = match;
      const current = newest.get(domain);
      if (!current || date > current.date) {
         newest.set(domain, { domain, date, file, version: date });
      }
   }
   // The modification time is read for the newest file of each domain only
   await Promise.all(Array.from(newest.values()).map(async (info) => {
      try {
         // The file name matched <safe domain>_<date>.jpg in the folder listing.
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         const { mtimeMs } = await stat(insideThumbnailDir(info.file));
         info.version = `${info.date}-${Math.floor(mtimeMs)}`;
      } catch {
         // Keeps the date as the version
      }
   }));
   return newest;
};

export const getThumbnail = async (domain: string): Promise<ThumbnailInfo | undefined> => {
   if (!isSafeThumbnailDomain(domain)) { return undefined; }
   return (await listThumbnails()).get(domain);
};

export const readThumbnailFile = async (info: ThumbnailInfo): Promise<Buffer> => (
   // The file name comes from the folder listing and matched <safe domain>_<date>.jpg.
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   readFile(insideThumbnailDir(info.file))
);

/** Deletes every thumbnail of a domain. Never throws: a leftover file is only logged. */
export const deleteThumbnails = async (domain: string): Promise<void> => {
   if (!isSafeThumbnailDomain(domain)) { return; }
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const names = await readdir(getThumbnailDir());
      for (const file of names) {
         if (FILE_PATTERN.exec(file)?.[1] === domain) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            await unlink(insideThumbnailDir(file)).catch(() => undefined);
         }
      }
   } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
         logger.warn('Could not delete the thumbnails of a domain', { domain, error: error instanceof Error ? error.message : String(error) });
      }
   }
};

/** One request to thum.io. Returns the image, or null while it is not ready (or on any failure). */
const requestScreenshot = async (domain: string): Promise<Buffer | null> => {
   const response = await fetch(`https://image.thum.io/get/maxAge/96/width/200/https://${domain}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
   });
   if (response.status !== 200) { return null; }
   // While thum.io is still generating a screenshot it answers 200 with a no-store placeholder
   if (/no-store|no-cache/i.test(response.headers.get('cache-control') || '')) { return null; }
   if (!(response.headers.get('content-type') || '').toLowerCase().startsWith('image/')) { return null; }
   const image = Buffer.from(await response.arrayBuffer());
   return image.length > 0 && image.length <= MAX_IMAGE_BYTES ? image : null;
};

const inFlight = new Map<string, Promise<boolean>>();
const failedAt = new Map<string, number>();
const waiting: Array<() => void> = [];
let running = 0;

const acquireSlot = async (): Promise<void> => {
   if (running < MAX_CONCURRENT_GENERATIONS) { running += 1; return; }
   await new Promise<void>((resolve) => { waiting.push(resolve); });
};
const releaseSlot = () => {
   const next = waiting.shift();
   if (next) { next(); } else { running -= 1; }
};

const generate = async (domain: string): Promise<boolean> => {
   await acquireSlot();
   try {
      let image: Buffer | null = null;
      for (let attempt = 0; attempt < GENERATION_ATTEMPTS && !image; attempt += 1) {
         if (attempt > 0) { await sleep(RETRY_DELAY_MS); }
         try {
            image = await requestScreenshot(domain);
         } catch (error) {
            logger.debug('Thumbnail request failed', { domain, error: error instanceof Error ? error.message : String(error) });
         }
      }
      if (!image) {
         failedAt.set(domain, Date.now());
         return false;
      }

      const dir = getThumbnailDir();
      const finalName = `${domain}_${todayStamp()}.jpg`;
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await mkdir(dir, { recursive: true });
      const tempPath = insideThumbnailDir(`${finalName}.tmp.${randomBytes(8).toString('hex')}`);
      const finalPath = insideThumbnailDir(finalName);
      // The paths are the data/thumbnails folder plus a validated domain and a date stamp.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await writeFile(tempPath, image);
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await rename(tempPath, finalPath);

      // The new image is saved, so the old ones can go
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      for (const file of await readdir(dir)) {
         if (file !== finalName && FILE_PATTERN.exec(file)?.[1] === domain) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            await unlink(insideThumbnailDir(file)).catch(() => undefined);
         }
      }
      failedAt.delete(domain);
      return true;
   } catch (error) {
      failedAt.set(domain, Date.now());
      logger.error('Could not generate a thumbnail', error instanceof Error ? error : new Error(String(error)), { domain });
      return false;
   } finally {
      releaseSlot();
   }
};

/** Generates a thumbnail now. Resolves to whether a new one was saved. A generation already running for the domain is joined. */
export const generateThumbnail = (domain: string): Promise<boolean> => {
   if (!isSafeThumbnailDomain(domain)) { return Promise.resolve(false); }
   const existingJob = inFlight.get(domain);
   if (existingJob) { return existingJob; }
   const job = generate(domain).finally(() => { inFlight.delete(domain); });
   inFlight.set(domain, job);
   return job;
};

/**
 * Starts background generation for every given domain that has no thumbnail or only one older than 30 days.
 * It does not wait for the result: the old image (if any) keeps being served until the new one is saved.
 */
export const ensureThumbnails = async (domains: string[], now: number = Date.now()): Promise<void> => {
   const existing = await listThumbnails();
   for (const domain of domains) {
      if (!isSafeThumbnailDomain(domain) || inFlight.has(domain)) { continue; }
      const current = existing.get(domain);
      if (current && !isThumbnailStale(current.date, now)) { continue; }
      const failed = failedAt.get(domain);
      if (failed && now - failed < FAILURE_COOLDOWN_MS) { continue; }
      generateThumbnail(domain).catch(() => undefined);
   }
};

/** Forgets what is running or failed (tests only) */
export const resetThumbnailState = (): void => {
   inFlight.clear();
   failedAt.clear();
   waiting.length = 0;
   running = 0;
};
