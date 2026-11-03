import { readFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { atomicWriteFile } from './atomicWrite';

/**
 * Session version shared by all login tokens. Every JWT carries the version it was issued under, and
 * verifyUser rejects a token whose version no longer matches. Logout bumps the version, which signs out
 * every session, including a copied token. The file lives apart from settings.json so settings saves cannot reset it.
 */
const sessionFilePath = (): string => path.join(process.cwd(), 'data', 'session.json');

/**
 * Reads the current session version synchronously, because verifyUser is synchronous.
 * A missing or unreadable file means version 0.
 */
export const getSessionVersion = (): number => {
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const raw = readFileSync(sessionFilePath(), 'utf-8');
      const version = Number((JSON.parse(raw) as { version?: unknown })?.version);
      return Number.isInteger(version) && version >= 0 ? version : 0;
   } catch (_error) {
      return 0;
   }
};

/**
 * Invalidates every issued session by moving the version forward. Resolves to the new version.
 */
export const revokeAllSessions = async (): Promise<number> => {
   const nextVersion = getSessionVersion() + 1;
   const filePath = sessionFilePath();
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   await mkdir(path.dirname(filePath), { recursive: true });
   await atomicWriteFile(filePath, JSON.stringify({ version: nextVersion }), 'utf-8');
   return nextVersion;
};
