import { writeFile } from 'fs/promises';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { logger } from './logger';

/**
 * Path of data/settings.json. Every read-modify-write of the file must run inside withSettingsLock, so two
 * saves (the settings page, the Google Ads callback, the Ads validation) cannot overwrite each other.
 */
export const settingsFilePath = (): string => path.join(process.cwd(), 'data', 'settings.json');

const LOCK_RETRIES = {
   retries: 12,
   factor: 1.5,
   minTimeout: 50,
   maxTimeout: 1500,
};

/**
 * Runs fn while holding an OS-level lock on data/settings.json. Creates the file as {} when it is missing,
 * because proper-lockfile needs the file to exist.
 */
export const withSettingsLock = async <T>(fn: () => Promise<T>): Promise<T> => {
   const filePath = settingsFilePath();
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await writeFile(filePath, '{}', { encoding: 'utf-8', flag: 'wx' });
   } catch (err: any) {
      if (err?.code !== 'EEXIST') {
         throw err;
      }
   }

   let release: () => Promise<void>;
   try {
      release = await lockfile.lock(filePath, { retries: LOCK_RETRIES });
   } catch (err: any) {
      logger.error('Could not lock settings file', err instanceof Error ? err : new Error(String(err)));
      throw err;
   }

   try {
      return await fn();
   } finally {
      try {
         await release();
      } catch (err: any) {
         logger.debug('Failed to release settings file lock', { error: err?.message });
      }
   }
};
