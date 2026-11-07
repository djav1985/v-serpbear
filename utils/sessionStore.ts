import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomInt } from 'crypto';
import { mkdir } from 'fs/promises';
import path from 'path';
import { atomicWriteFile } from './atomicWrite';

/**
 * Session version shared by all login tokens. Every JWT carries the version it was issued under, and
 * verifyUser rejects a token whose version no longer matches. Logout bumps the version, which signs out
 * every session, including a copied token. The file lives apart from settings.json so settings saves cannot reset it.
 */
const sessionFilePath = (): string => path.join(process.cwd(), 'data', 'session.json');

// Last version this process read or wrote. When the file cannot be read or parsed afterwards (deleted, mid-restore,
// transient EMFILE/EBUSY), fall back to this instead of 0, so revoked tokens do not become valid again and
// current sessions are not signed out by a failed read.
let lastKnownVersion: number | null = null;

// Every authenticated request checks the version, so the file is read at most once per second instead of once per
// check. Logout updates this process straight away (see revokeAllSessions); a change made to the file by something
// else is picked up within the interval.
const VERSION_CACHE_MS = 1000;
let cachedVersion: number | null = null;
let cachedAt = 0;

/** Test helper: forget the cached version. */
export const resetSessionVersionCache = (): void => {
   lastKnownVersion = null;
   cachedVersion = null;
   cachedAt = 0;
};

/**
 * Picks a non-zero version for a session file that does not exist yet (or holds nothing usable) and stores it,
 * so tokens issued under an older file, or without a version (which count as 0), are not accepted again after
 * the file is lost or restored. Failing to store it is not fatal: the version still lives in memory.
 */
const initialiseVersion = (): number => {
   const version = lastKnownVersion ?? randomInt(1, 2 ** 31);
   lastKnownVersion = version;
   try {
      const filePath = sessionFilePath();
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      mkdirSync(path.dirname(filePath), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      writeFileSync(filePath, JSON.stringify({ version }), 'utf-8');
   } catch (_error) {
      // Kept in memory only
   }
   return version;
};

/**
 * Reads the current session version synchronously, because verifyUser is synchronous.
 * A missing or unparseable file gets a fresh non-zero version (or the last one this process saw), which is stored.
 * Any other read error (busy file) uses the last version seen by this process without touching the file.
 */
export const getSessionVersion = (): number => {
   const now = Date.now();
   if (cachedVersion !== null && now - cachedAt < VERSION_CACHE_MS) {
      return cachedVersion;
   }
   const version = readSessionVersion();
   cachedVersion = version;
   cachedAt = now;
   return version;
};

const readSessionVersion = (): number => {
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const raw = readFileSync(sessionFilePath(), 'utf-8');
      const version = Number((JSON.parse(raw) as { version?: unknown })?.version);
      if (Number.isInteger(version) && version >= 0) {
         lastKnownVersion = version;
         return version;
      }
      return initialiseVersion();
   } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT' || error instanceof SyntaxError) {
         return initialiseVersion();
      }
      return lastKnownVersion ?? (lastKnownVersion = randomInt(1, 2 ** 31));
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
   lastKnownVersion = nextVersion;
   cachedVersion = nextVersion;
   cachedAt = Date.now();
   return nextVersion;
};
