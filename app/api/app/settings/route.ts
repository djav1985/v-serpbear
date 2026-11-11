import Cryptr from 'cryptr';
import { logger } from '../../../../utils/logger';
import { verifySessionToken } from '../../../../utils/verifyUser';
import { getCookie } from '../../../../utils/api/cookies';
import { createRoute, fail, json, readJson, requireAuth, type ApiContext } from '../../../../utils/apiLogging';
import { trimStringProperties } from '../../../../utils/security';
import { getBranding } from '../../../../utils/branding';
import { getAppSettings, normalizeLegacySettings, readStoredSettingsFile } from '../../../../utils/appSettings';
import packageJson from '../../../../package.json';
import { atomicWriteFile } from '../../../../utils/atomicWrite';
import { withSettingsLock, withoutRemovedSettingsKeys } from '../../../../utils/settingsFile';
import { APP_TIMEZONE } from '../../../../utils/timezone';
import { DERIVED_SETTINGS_FIELDS, PERSISTED_SETTINGS_FIELDS, SECRET_SETTINGS_FIELDS, validateSettingsPayload } from '../../../../utils/settingsPayload';

const getSettings = async (req: Request, ctx: ApiContext) => {
   try {
      // The settings editor must never mistake the public, branding-only response for
      // the complete settings object. Opt-in full reads are explicitly authenticated.
      const includePrivate = new URL(req.url).searchParams.get('includePrivate') === 'true';
      if (includePrivate) {
         const denied = requireAuth(req, ctx);
         if (denied) { return denied; }
      }

      // Silently check if user is authenticated without logging auth failures for anonymous GETs
      let isAuthenticated = false;
      try {
         const token = getCookie(req, 'token');
         // Same check as verifyUser, including the session version, so a token revoked by logout is rejected here too
         if (token) {
            verifySessionToken(token);
            isAuthenticated = true;
         }
      } catch (_) { /* not authenticated — silent for public endpoint */ }
      
      const settings = await getAppSettings();
      if (!settings) {
         return fail(500, 'INTERNAL_SERVER_ERROR', 'Settings could not be loaded.', ctx);
      }
      
      const version = packageJson.version;
      // Read-only and public: the name and logo are shown on the login page before anyone signs in.
      const branding = getBranding();
      
      if (isAuthenticated || includePrivate) {
         // Return full settings for authenticated users
         return json({ settings: { ...settings, version, timezone: APP_TIMEZONE, branding } });
      } else {
         // Return only safe, public settings for unauthenticated users
         const publicSettings = {
            scraper_type: settings.scraper_type || 'none',
            available_scapers: settings.available_scapers || [],
            search_console_integrated: settings.search_console_integrated || false,
            version,
            timezone: APP_TIMEZONE,
            branding,
         };
         return json({ settings: publicSettings });
      }
   } catch (error) {
      logger.error('Error loading app settings', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to load settings.', ctx);
   }
};

const updateSettings = async (req: Request, ctx: ApiContext) => {
   const denied = requireAuth(req, ctx);
   if (denied) { return denied; }
   const { settings } = ((await readJson(req)) || {}) as { settings?: Record<string, unknown> };
   if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return fail(400, 'BAD_REQUEST', 'Settings payload is required.', ctx);
   }
   
   if (!process.env.SECRET) {
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Server configuration error', ctx);
   }
   
   try {
      // Only known settings are stored; derived fields and unknown keys in the payload are dropped
      const incomingSettings: Record<string, unknown> = {};
      PERSISTED_SETTINGS_FIELDS.forEach((field) => {
         if (Object.prototype.hasOwnProperty.call(settings, field)) { incomingSettings[field] = settings[field]; }
      });
      const normalizedSettings: SettingsType = trimStringProperties(normalizeLegacySettings(incomingSettings as Partial<SettingsType>)) as SettingsType;

      const validationErrors = validateSettingsPayload(normalizedSettings as unknown as Record<string, unknown>);
      if (validationErrors.length > 0) {
         return fail(400, 'BAD_REQUEST', validationErrors.join(' '), ctx);
      }

      const cryptr = new Cryptr(process.env.SECRET);
      const encrypt = (value?: string) => (value ? cryptr.encrypt(value) : '');

      // Save is a merge: the stored settings are read under the lock, the payload is applied over them, and any
      // key the payload leaves out keeps its stored value. Secrets are encrypted here; an absent secret keeps its
      // stored (encrypted) value, which also covers adwords_refresh_token written by the Google OAuth callback.
      await withSettingsLock(async () => {
         // A file that cannot be read (corrupt JSON included) fails the save instead of being overwritten, so
         // the stored secrets are not blanked. A missing or empty file reads as {}.
         const existingSettings: Partial<SettingsType> = await readStoredSettingsFile(`${process.cwd()}/data/settings.json`);

         const merged: Record<string, unknown> = { ...existingSettings, ...normalizedSettings };
         SECRET_SETTINGS_FIELDS.forEach((key) => {
            merged[key] = key in normalizedSettings
               ? encrypt(normalizedSettings[key] as string)
               : ((existingSettings[key] as string | undefined) ?? '');
         });
         DERIVED_SETTINGS_FIELDS.forEach((field) => { delete merged[field]; });

         await atomicWriteFile(`${process.cwd()}/data/settings.json`, JSON.stringify(withoutRemovedSettingsKeys(merged)), 'utf-8');
      });
      return json({ settings: normalizedSettings });
   } catch (error) {
      logger.error('Error updating app settings', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to update settings.', ctx);
   }
};

// GET is public (a trimmed view when signed out); PUT checks the session itself.
export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'settings', auth: false, GET: getSettings, PUT: updateSettings });
