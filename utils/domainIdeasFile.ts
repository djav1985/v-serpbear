import { unlink } from 'fs/promises';
import path from 'path';
import { logger } from './logger';
import { SAFE_DOMAIN_NAME } from './domainSlug';
import { getUnknownErrorCode, getUnknownErrorMessage } from './errorSerialization';

/** The research page has no domain, so its ideas live in data/IDEAS_research.json. */
export const RESEARCH_IDEAS_KEY = 'research';

/**
 * Returns the path of the keyword ideas file (data/IDEAS_<domain>.json) for a real domain name, or null when the
 * name has characters that must never reach a file path or would escape the data directory.
 */
export const getIdeasFilePath = (domain: string): string | null => {
   if (typeof domain !== 'string' || !SAFE_DOMAIN_NAME.test(domain)) {
      return null;
   }
   const dataDir = path.resolve(process.cwd(), 'data');
   const filePath = path.resolve(dataDir, `IDEAS_${domain}.json`);
   return filePath.startsWith(dataDir + path.sep) ? filePath : null;
};

/**
 * Removes the keyword ideas file of a deleted domain. A missing file is not an error.
 * Never throws, so a failure here cannot fail a domain delete. Returns false only when the file could not be removed.
 */
export const removeDomainIdeasFile = async (domain: string): Promise<boolean> => {
   try {
      const filePath = getIdeasFilePath(domain);
      if (!filePath) {
         return true;
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(filePath);
      return true;
   } catch (error) {
      if (getUnknownErrorCode(error) === 'ENOENT') {
         return true;
      }
      logger.error('Domain deleted, but its keyword ideas file could not be removed', undefined, { domain, error: getUnknownErrorMessage(error) });
      return false;
   }
};
