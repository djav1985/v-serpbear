import { writeFile } from 'fs/promises';
import * as lockfile from 'proper-lockfile';
import { logger } from './logger';
import { getUnknownErrorCode, getUnknownErrorMessage } from './errorSerialization';

const LOCK_RETRIES = {
   retries: 12,
   factor: 1.5,
   minTimeout: 50,
   maxTimeout: 1500,
};

/**
 * Runs fn while holding an OS-level lock on filePath, the same pattern as withSettingsLock. Creates the file
 * with `{}` when it is missing, because proper-lockfile needs the file to exist.
 */
export const withFileLock = async <T>(filePath: string, fn: () => Promise<T>): Promise<T> => {
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await writeFile(filePath, '{}', { encoding: 'utf-8', flag: 'wx' });
   } catch (err) {
      if (getUnknownErrorCode(err) !== 'EEXIST') {
         throw err;
      }
   }

   let release: () => Promise<void>;
   try {
      release = await lockfile.lock(filePath, { retries: LOCK_RETRIES });
   } catch (err) {
      logger.error('Could not lock file', err instanceof Error ? err : new Error(String(err)), { filePath });
      throw err;
   }

   try {
      return await fn();
   } finally {
      try {
         await release();
      } catch (err) {
         logger.debug('[LOCK] Failed to release file lock', { error: getUnknownErrorMessage(err) });
      }
   }
};
