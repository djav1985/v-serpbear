import { unlink } from 'fs/promises';
import path from 'path';
import { logger } from './logger';
import { SAFE_DOMAIN_SLUG, toDomainSlug } from './domainSlug';

/**
 * Removes the keyword ideas file (data/IDEAS_<domain>.json) of a deleted domain. The file name is built the same
 * way utils/adwords.ts reads it: the slug is turned back into the domain name. A missing file is not an error.
 * Never throws, so a failure here cannot fail a domain delete. Returns false only when the file could not be removed.
 */
export const removeDomainIdeasFile = async (domain: string): Promise<boolean> => {
   try {
      const slug = toDomainSlug(domain);
      if (!SAFE_DOMAIN_SLUG.test(slug)) {
         return true;
      }
      const domainName = slug.replaceAll('-', '.').replaceAll('_', '-');
      const dataDir = path.resolve(process.cwd(), 'data');
      const filePath = path.resolve(dataDir, `IDEAS_${domainName}.json`);
      if (!filePath.startsWith(dataDir + path.sep)) {
         return true;
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(filePath);
      return true;
   } catch (error: any) {
      if (error?.code === 'ENOENT') {
         return true;
      }
      logger.warn('Domain deleted, but its keyword ideas file could not be removed', { domain, error: error?.message });
      return false;
   }
};
