import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import path from 'path';
import { logger } from './logger';
import { isCurrentDomainRecord, withDomainLifecycleLock } from './domainLifecycle';

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
const FILE_PATTERN = /^(.+)_(\d{4}-\d{2}-\d{2})(?:_(\d{13}-[a-f0-9]{16}))?\.jpg$/;
// Domains are validated as host names when they are added; this is a second check because the name becomes a file name
const SAFE_DOMAIN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/**
 * date is the day in the file name and decides when the thumbnail is old. version changes every time the file is
 * written (it adds the file's modification time), so an image regenerated on the same day still gets a new address.
 */
export type ThumbnailInfo = { domain: string; date: string; file: string; version: string };
export type ThumbnailIndexEntry = { ID: number; domain: string; file: string; contentType: string; generatedAt: number };

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

export const isThumbnailStale = (date: string | number, now: number = Date.now()): boolean => {
   const generated = typeof date === 'number' ? date : Date.parse(`${date}T00:00:00Z`);
   return !Number.isFinite(generated) || now >= generated + (THUMBNAIL_MAX_AGE_DAYS * DAY_MS);
};

const isValidImageContentType = (value: unknown): value is string => (
   typeof value === 'string' && /^image\/[a-z0-9.+-]+$/i.test(value.split(';', 1)[0].trim())
);

const thumbnailIndex = new Map<number, ThumbnailIndexEntry>();

/** Builds the ID index from saved files, restricting it to domains that are currently tracked. */
export const initializeThumbnailIndex = async (domains: Array<{ ID: number; domain: string }>): Promise<void> => {
   thumbnailIndex.clear();
   const tracked = new Map(domains
      .filter((item) => Number.isSafeInteger(item.ID) && item.ID > 0 && isSafeThumbnailDomain(item.domain))
      .map((item) => [item.domain, item.ID]));
   const newest = new Map<string, { ID: number; domain: string; date: string; suffix: string; file: string }>();
   for (const file of await readFolder()) {
      const match = FILE_PATTERN.exec(file);
      if (!match) { continue; }
      const [, domain, date, suffix = ''] = match;
      const ID = tracked.get(domain);
      if (!ID) { continue; }
      const current = newest.get(domain);
      if (!current || date > current.date || (date === current.date && suffix > current.suffix)) {
         newest.set(domain, { ID, domain, date, suffix, file });
      }
   }
   await Promise.all(Array.from(newest.values()).map(async ({ ID, domain, file }) => {
      try {
         // Candidate names matched FILE_PATTERN and belong to a tracked domain.
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         const info = await stat(insideThumbnailDir(file));
         if (!info.isFile() || info.size <= 0 || info.size > MAX_IMAGE_BYTES) { return; }
         let contentType = 'image/jpeg';
         let hasValidMetadata = false;
         try {
            // The sidecar is written after the image and stores the upstream-validated type.
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const metadata = JSON.parse(await readFile(insideThumbnailDir(`${file}.meta.json`), 'utf8')) as { contentType?: unknown };
            if (isValidImageContentType(metadata.contentType)) {
               contentType = metadata.contentType;
               hasValidMetadata = true;
            }
         } catch {
            // Immutable generated names require metadata; legacy canonical files default to JPEG.
            if (FILE_PATTERN.exec(file)?.[3]) { return; }
         }
         if (!isValidImageContentType(contentType) || (FILE_PATTERN.exec(file)?.[3] && !hasValidMetadata)) { return; }
         thumbnailIndex.set(ID, { ID, domain, file, contentType, generatedAt: info.mtimeMs });
      } catch { /* A file removed during startup scanning is skipped. */ }
   }));
};

/** The saved thumbnail for a tracked domain ID, without a filesystem freshness scan. */
export const getThumbnailById = (id: number): ThumbnailIndexEntry | undefined => thumbnailIndex.get(id);

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** The file names in the thumbnails folder. A missing folder or a read error gives an empty list. */
const readFolder = async (): Promise<string[]> => {
   try {
      // The folder is data/thumbnails, never built from a request.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return await readdir(getThumbnailDir());
   } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
         logger.error('Could not read the thumbnails folder', error instanceof Error ? error : new Error(String(error)));
      }
      return [];
   }
};

/** Newest thumbnail of every domain that has one, from a single read of the thumbnails folder */
export const listThumbnails = async (): Promise<Map<string, ThumbnailInfo>> => {
   const newest = new Map<string, ThumbnailInfo>();
   for (const file of await readFolder()) {
      const match = FILE_PATTERN.exec(file);
      if (!match) { continue; }
      const [, domain, date] = match;
      const current = newest.get(domain);
      if (!current || date > current.date || (date === current.date && file > current.file)) {
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

/** The newest thumbnail of one domain. Only that domain's file is stat-ed, so an image request does not scan every domain. */
export const getThumbnail = async (domain: string): Promise<ThumbnailInfo | undefined> => {
   if (!isSafeThumbnailDomain(domain)) { return undefined; }
   let newest: ThumbnailInfo | undefined;
   for (const file of await readFolder()) {
      const match = FILE_PATTERN.exec(file);
      if (!match || match[1] !== domain) { continue; }
      const date = match[2];
      if (!newest || date > newest.date || (date === newest.date && file > newest.file)) {
         newest = { domain, date, file, version: date };
      }
   }
   if (!newest) { return undefined; }
   try {
      // The file name matched <safe domain>_<date>.jpg in the folder listing.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const { mtimeMs } = await stat(insideThumbnailDir(newest.file));
      newest.version = `${newest.date}-${Math.floor(mtimeMs)}`;
   } catch {
      // Keeps the date as the version
   }
   return newest;
};

export const readThumbnailFile = async (info: { file: string }): Promise<Buffer> => (
   // The file name comes from the folder listing and matched <safe domain>_<date>.jpg.
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   readFile(insideThumbnailDir(info.file))
);

/** Deletes every thumbnail of a domain. Never throws: a leftover file is only logged. */
export const deleteThumbnails = async (domain: string): Promise<void> => {
   if (!isSafeThumbnailDomain(domain)) { return; }
   for (const [id, entry] of thumbnailIndex) {
      if (entry.domain === domain) { thumbnailIndex.delete(id); }
   }
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const names = await readdir(getThumbnailDir());
      for (const file of names) {
         if (FILE_PATTERN.exec(file)?.[1] === domain) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            await unlink(insideThumbnailDir(file)).catch(() => undefined);
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            await unlink(insideThumbnailDir(`${file}.meta.json`)).catch(() => undefined);
         }
      }
   } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
         logger.warn('Could not delete the thumbnails of a domain', { domain, error: error instanceof Error ? error.message : String(error) });
      }
   }
};

/** One request to thum.io. Returns the image, or null while it is not ready (or on any failure). */
const requestScreenshot = async (domain: string): Promise<{ image: Buffer; contentType: string } | null> => {
   const response = await fetch(`https://image.thum.io/get/maxAge/96/width/200/https://${domain}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
   });
   if (response.status !== 200) { return null; }
   // While thum.io is still generating a screenshot it answers 200 with a no-store placeholder
   if (/no-store|no-cache/i.test(response.headers.get('cache-control') || '')) { return null; }
   const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
   if (!isValidImageContentType(contentType)) { return null; }
   if (!response.body) { return null; }

   const reader = response.body.getReader();
   const chunks: Uint8Array[] = [];
   let totalBytes = 0;
   try {
      while (true) {
         const { done, value } = await reader.read();
         if (done) { break; }
         if (!value) { continue; }

         totalBytes += value.byteLength;
         if (totalBytes > MAX_IMAGE_BYTES) {
            await reader.cancel().catch(() => undefined);
            return null;
         }
         chunks.push(value);
      }
   } finally {
      reader.releaseLock();
   }

   return totalBytes > 0 ? { image: Buffer.concat(chunks, totalBytes), contentType } : null;
};

const inFlight = new Map<string, Promise<ThumbnailIndexEntry | undefined>>();
const generationKey = (domain: string, domainID: number): string => `${domain}:${domainID}`;
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

const generate = async (domain: string, domainID: number): Promise<ThumbnailIndexEntry | undefined> => {
   await acquireSlot();
   try {
      let screenshot: { image: Buffer; contentType: string } | null = null;
      for (let attempt = 0; attempt < GENERATION_ATTEMPTS && !screenshot; attempt += 1) {
         if (attempt > 0) { await sleep(RETRY_DELAY_MS); }
         try {
            screenshot = await requestScreenshot(domain);
         } catch (error) {
            logger.debug('Thumbnail request failed', { domain, error: error instanceof Error ? error.message : String(error) });
         }
      }
      if (!screenshot) {
         failedAt.set(domain, Date.now());
         return undefined;
      }

      return await withDomainLifecycleLock(domain, async () => {
      if (!await isCurrentDomainRecord(domain, domainID)) return undefined;
      const dir = getThumbnailDir();
      const finalName = `${domain}_${todayStamp()}_${Date.now()}-${randomBytes(8).toString('hex')}.jpg`;
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await mkdir(dir, { recursive: true });
      const tempPath = insideThumbnailDir(`${finalName}.tmp.${randomBytes(8).toString('hex')}`);
      const finalPath = insideThumbnailDir(finalName);
      // The paths are the data/thumbnails folder plus a validated domain and a date stamp.
      try {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await writeFile(tempPath, screenshot.image);
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await rename(tempPath, finalPath);
      } catch (error) {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await unlink(tempPath).catch(() => undefined);
         throw error;
      }

      const metadataPath = insideThumbnailDir(`${finalName}.meta.json`);
      const metadataTempPath = insideThumbnailDir(`${finalName}.meta.json.tmp.${randomBytes(8).toString('hex')}`);
      try {
         // Unique files require a complete metadata sidecar before they can be indexed or recovered after restart.
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await writeFile(metadataTempPath, JSON.stringify({ contentType: screenshot.contentType }));
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await rename(metadataTempPath, metadataPath);
      } catch (error) {
         // This image has no committed sidecar or index entry, so remove it for startup scans to ignore it.
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await unlink(finalPath).catch(() => undefined);
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await unlink(metadataTempPath).catch(() => undefined);
         throw error;
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const savedStat = await stat(finalPath);
      const entry: ThumbnailIndexEntry = { ID: domainID, domain, file: finalName, contentType: screenshot.contentType, generatedAt: savedStat.mtimeMs };

      // Publish the new immutable image and its metadata together before removing the predecessor.
      thumbnailIndex.set(domainID, entry);
      try {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         for (const file of await readdir(dir)) {
            if (file !== finalName && FILE_PATTERN.exec(file)?.[1] === domain) {
               // eslint-disable-next-line security/detect-non-literal-fs-filename
               await unlink(insideThumbnailDir(file)).catch(() => undefined);
               // eslint-disable-next-line security/detect-non-literal-fs-filename
               await unlink(insideThumbnailDir(`${file}.meta.json`)).catch(() => undefined);
            }
         }
      } catch (error) {
         logger.warn('Could not remove old thumbnail files after replacement', { domain, error: error instanceof Error ? error.message : String(error) });
      }
      failedAt.delete(domain);
      return entry;
      });
   } catch (error) {
      failedAt.set(domain, Date.now());
      logger.error('Could not generate a thumbnail', error instanceof Error ? error : new Error(String(error)), { domain });
      return undefined;
   } finally {
      releaseSlot();
   }
};

/** Generates a thumbnail now. Resolves to whether a new one was saved. A generation already running for the domain is joined. */
export const generateThumbnail = (domain: string, domainID: number): Promise<ThumbnailIndexEntry | undefined> => {
   if (!isSafeThumbnailDomain(domain) || !Number.isSafeInteger(domainID) || domainID <= 0) { return Promise.resolve(undefined); }
   const failed = failedAt.get(domain);
   if (failed && Date.now() - failed < FAILURE_COOLDOWN_MS) { return Promise.resolve(undefined); }
   const key = generationKey(domain, domainID);
   const existingJob = inFlight.get(key);
   if (existingJob) { return existingJob; }
   const job = generate(domain, domainID).finally(() => { inFlight.delete(key); });
   inFlight.set(key, job);
   return job;
};

/**
 * Starts background generation for every given domain that has no thumbnail or only one older than 30 days.
 * It does not wait for the result: the old image (if any) keeps being served until the new one is saved.
 */
export const ensureThumbnails = async (domains: Array<{ domain: string; ID: number }>, now: number = Date.now()): Promise<void> => {
   for (const entry of domains) {
      const domain = entry.domain;
      const domainID = entry.ID;
      const key = generationKey(domain, domainID);
      if (!isSafeThumbnailDomain(domain) || inFlight.has(key)) { continue; }
      const current = thumbnailIndex.get(domainID);
      if (current && current.domain === domain && !isThumbnailStale(current.generatedAt, now)) { continue; }
      const failed = failedAt.get(domain);
      if (failed && now - failed < FAILURE_COOLDOWN_MS) { continue; }
      generateThumbnail(domain, domainID).catch(() => undefined);
   }
};

/** Forgets what is running or failed (tests only) */
export const resetThumbnailState = (): void => {
   inFlight.clear();
   failedAt.clear();
   thumbnailIndex.clear();
   waiting.length = 0;
   running = 0;
};
