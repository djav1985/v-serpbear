import Cryptr from 'cryptr';
import { logger } from '../../../../utils/logger';
import { maskSecretSettings, SECRET_MARKER } from '../../../../utils/settingsSecrets';
import { createRoute, fail, json, requireAuth, type ApiContext } from '../../../../utils/apiLogging';
import { parseBody, parseQuery } from '../../../../utils/api/validate';
import { trimStringProperties } from '../../../../utils/security';
import { getBranding } from '../../../../utils/branding';
import { getAppSettings, normalizeLegacySettings, readStoredSettingsFile } from '../../../../utils/appSettings';
import packageJson from '../../../../package.json';
import { atomicWriteFile } from '../../../../utils/atomicWrite';
import { withSettingsLock, withoutRemovedSettingsKeys } from '../../../../utils/settingsFile';
import { APP_TIMEZONE } from '../../../../utils/timezone';
import { DERIVED_SETTINGS_FIELDS, PERSISTED_SETTINGS_FIELDS, SECRET_SETTINGS_FIELDS, validateSettingsPayload } from '../../../../utils/settingsPayload';

const getSettings = async (req: Request, ctx: ApiContext) => {
   // includePrivate is true or false; anything else is refused by the contract
   const includePrivate = parseQuery(req, 'settings.get').includePrivate === true;
   try {
      // The settings editor must never mistake the public, branding-only response for
      // the complete settings object. Opt-in full reads are explicitly authenticated.
      if (includePrivate) {
         const denied = requireAuth(req, ctx);
         if (denied) { return denied; }
      }

      const settings = await getAppSettings();
      if (!settings) {
         return fail(500, 'INTERNAL_SERVER_ERROR', 'Settings could not be loaded.', ctx);
      }
      
      const version = packageJson.version;
      // Read-only and public: the name and logo are shown on the login page before anyone signs in.
      const branding = getBranding();
      
      if (includePrivate) {
         // The full view needs a session (checked above). Secrets are never returned: a stored one is the marker, an unset one is empty.
         return json({ settings: { ...maskSecretSettings(settings as unknown as Record<string, unknown>), version, timezone: APP_TIMEZONE, branding } });
      } else {
         // Everyone, signed in or not, gets the public subset unless includePrivate=true is asked for
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
   const { settings } = await parseBody(req, 'settings.save');

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
      let savedSecrets: Record<string, unknown> = {};
      await withSettingsLock(async () => {
         // A file that cannot be read (corrupt JSON included) fails the save instead of being overwritten, so
         // the stored secrets are not blanked. A missing or empty file reads as {}.
         const existingSettings: Partial<SettingsType> = await readStoredSettingsFile(`${process.cwd()}/data/settings.json`);

         const merged: Record<string, unknown> = { ...existingSettings, ...normalizedSettings };
         SECRET_SETTINGS_FIELDS.forEach((key) => {
            // Omitted or the marker: keep the stored value. Anything else replaces it, and an empty value clears it.
            const keepsStored = !(key in normalizedSettings) || normalizedSettings[key] === SECRET_MARKER;
            merged[key] = keepsStored
               ? ((existingSettings[key] as string | undefined) ?? '')
               : encrypt(normalizedSettings[key] as string);
         });
         savedSecrets = Object.fromEntries(SECRET_SETTINGS_FIELDS.map((key) => [key, merged[key]]));
         DERIVED_SETTINGS_FIELDS.forEach((field) => { delete merged[field]; });

         await atomicWriteFile(`${process.cwd()}/data/settings.json`, JSON.stringify(withoutRemovedSettingsKeys(merged)), 'utf-8');
      });
      // Echo the saved values with every secret masked, never what was submitted
      return json({ settings: { ...normalizedSettings, ...maskSecretSettings(savedSecrets) } });
   } catch (error) {
      logger.error('Error updating app settings', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to update settings.', ctx);
   }
};

// GET is public (a trimmed view when signed out); PUT checks the session itself.
export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'settings', auth: false, GET: getSettings, PUT: updateSettings });
