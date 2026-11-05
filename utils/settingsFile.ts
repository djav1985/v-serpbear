import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { logger } from './logger';

/**
 * Path of data/settings.json. Every read-modify-write of the file must run inside withSettingsLock, so two
 * saves (the settings page, the Google Ads callback, the Ads validation) cannot overwrite each other.
 */
const settingsFilePath = (): string => path.join(process.cwd(), 'data', 'settings.json');

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

/**
 * Reads data/settings.json as stored (secrets still encrypted). A missing, empty or whitespace-only file means
 * there are no stored settings yet. A non-empty file that is not a valid JSON object is logged and thrown, so a
 * save never builds on {} and blanks the stored secrets. Any other read error is thrown too.
 */
export const readSettingsFile = async (settingsPath: string = settingsFilePath()): Promise<Partial<SettingsType>> => {
   let raw: unknown;
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      raw = await readFile(settingsPath, { encoding: 'utf-8' });
   } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
         return {};
      }
      throw err;
   }
   if (typeof raw !== 'string' || !raw.trim()) {
      return {};
   }
   let parsed: unknown;
   try {
      parsed = JSON.parse(raw);
   } catch (err) {
      const error = new Error(`settings.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
      logger.error('Settings file is corrupt', error);
      throw error;
   }
   if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const error = new Error('settings.json does not hold a JSON object');
      logger.error('Settings file is corrupt', error);
      throw error;
   }
   return parsed as Partial<SettingsType>;
};
