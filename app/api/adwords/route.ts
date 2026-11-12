import { OAuth2Client } from 'google-auth-library';
import Cryptr from 'cryptr';
import { randomBytes } from 'crypto';
import { getAdwordsCredentials, getAdwordsKeywordIdeas } from '../../../utils/adwords';
import { logger } from '../../../utils/logger';
import { createRoute, fail, json, getParam, readJson, requireAuth, type ApiContext } from '../../../utils/apiLogging';
import { atomicWriteFile } from '../../../utils/atomicWrite';
import { readSettingsFile, withSettingsLock, withoutRemovedSettingsKeys } from '../../../utils/settingsFile';
import normalizeOrigin from '../../../utils/normalizeOrigin';
import { serializeForScript } from '../../../utils/api/scriptJson';
import { getUnknownProperty } from '../../../utils/errorSerialization';


type IntegrationResultOptions = {
   success: boolean;
   message?: string;
   statusCode?: number;
};

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// Pending OAuth states are kept on the server instead of in a cookie: the browser did not send the
// state cookie back on Google's redirect, so the callback could not match it. Each state is random,
// single-use and expires after OAUTH_STATE_TTL_MS. Stored on globalThis so dev hot reload keeps them.
const globalForOAuth = globalThis as typeof globalThis & { __serpbearOAuthStates?: Map<string, number> };
const pendingOAuthStates = (globalForOAuth.__serpbearOAuthStates ??= new Map<string, number>());

const pruneExpiredStates = (now: number) => {
   for (const [state, expiresAt] of pendingOAuthStates) {
      if (expiresAt <= now) {
         pendingOAuthStates.delete(state);
      }
   }
};

const getTrustedOrigin = () => {
   const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '');
   if (configuredOrigin) {
      return configuredOrigin;
   }
   return '';
};

const respondWithIntegrationResult = (
   { success, message = '', statusCode }: IntegrationResultOptions,
) => {
   const origin = getTrustedOrigin();
   const status = success ? 'success' : 'error';
   const payload = { type: 'adwordsIntegrated', status, message };
   const redirectUrl = `${origin}/domains?ads=integrated&status=${status}${message ? `&detail=${encodeURIComponent(message)}` : ''}`;

   const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Google Ads Integration</title>
  </head>
  <body>
    <script>
      (function() {
        const payload = ${serializeForScript(payload)};
        const redirectUrl = ${serializeForScript(redirectUrl)};
        try {
          if (window.opener && typeof window.opener.postMessage === 'function') {
            window.opener.postMessage(payload, window.location.origin);
            window.close();
            return;
          }
        } catch (err) {
          console.warn('Failed to notify opener', err?.message || String(err));
        }
        if (redirectUrl) {
          window.location.replace(redirectUrl);
        }
      })();
    </script>
    <p>Google Ads integration ${success ? 'completed' : 'failed'}. You can close this window.</p>
  </body>
</html>`;

   return new Response(html, {
      status: statusCode ?? (success ? 200 : 400),
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
   });
};

const beginAdwordsIntegration = async (req: Request, ctx: ApiContext) => {
   const denied = requireAuth(req, ctx);
   if (denied) { return denied; }
   try {
      const trustedOrigin = getTrustedOrigin();
      if (!trustedOrigin) {
         return fail(500, 'INTERNAL_SERVER_ERROR', 'A trusted APP_URL or NEXT_PUBLIC_APP_URL must be configured for OAuth.', ctx);
      }
      if (!process.env.SECRET) {
         logger.error('Starting Google Ads OAuth integration: SECRET is not configured');
         return fail(500, 'INTERNAL_SERVER_ERROR', 'Server configuration error', ctx);
      }
      const settings = await readSettingsFile() as SettingsType;
      const cryptr = new Cryptr(process.env.SECRET as string);
      const clientId = settings.adwords_client_id ? cryptr.decrypt(settings.adwords_client_id) : '';
      if (!clientId) {
         return fail(400, 'BAD_REQUEST', 'Google Ads client ID is not configured.', ctx);
      }
      const state = randomBytes(32).toString('base64url');
      const now = Date.now();
      pruneExpiredStates(now);
      pendingOAuthStates.set(state, now + OAUTH_STATE_TTL_MS);
      const redirectUri = `${trustedOrigin}/api/adwords`;
      const params = new URLSearchParams({
         access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/adwords',
         response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
      });
      return json({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
   } catch (error) {
      logger.error('Starting Google Ads OAuth integration', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Unable to start Google Ads integration.', ctx);
   }
};

const getAdwordsRefreshToken = async (req: Request, _ctx: ApiContext) => {
   try {
      const code = getParam(req, 'code') as string;
      const trustedOrigin = getTrustedOrigin();
      if (!trustedOrigin) {
         return respondWithIntegrationResult({
            success: false,
            message: 'OAuth callback rejected because trusted app origin is not configured.',
            statusCode: 500,
         });
      }
      const redirectURL = `${trustedOrigin}/api/adwords`;

      if (code) {
         const suppliedState = getParam(req, 'state') ?? '';
         const now = Date.now();
         pruneExpiredStates(now);
         const expiresAt = pendingOAuthStates.get(suppliedState);
         // Consume before any asynchronous work so every callback attempt is one-time.
         pendingOAuthStates.delete(suppliedState);
         const stateMatches = expiresAt !== undefined && expiresAt > now;
         if (!stateMatches) {
            // Log only presence and counts, never the state value.
            logger.warn('OAuth callback state check failed', {
               statePresent: suppliedState.length > 0,
               pendingStates: pendingOAuthStates.size,
               host: req.headers.get('host'),
               forwardedProto: req.headers.get('x-forwarded-proto'),
            });
            return respondWithIntegrationResult({
               success: false,
               message: 'Invalid or expired OAuth state. Please start the integration again.',
               statusCode: 400,
            });
         }
         try {
            const settings = await readSettingsFile() as SettingsType;
            const cryptr = new Cryptr(process.env.SECRET as string);
            const adwords_client_id = settings.adwords_client_id ? cryptr.decrypt(settings.adwords_client_id) : '';
            const adwords_client_secret = settings.adwords_client_secret ? cryptr.decrypt(settings.adwords_client_secret) : '';
            const oAuth2Client = new OAuth2Client({
               clientId: adwords_client_id,
               clientSecret: adwords_client_secret,
               redirectUri: redirectURL,
            });
            const r = await oAuth2Client.getToken(code);
            if (r?.tokens?.refresh_token) {
               const adwords_refresh_token = cryptr.encrypt(r.tokens.refresh_token);
               // Re-read under the lock so settings saved while Google was answering are kept
               await withSettingsLock(async () => {
                  const current = await readSettingsFile() as SettingsType;
                  await atomicWriteFile(`${process.cwd()}/data/settings.json`, JSON.stringify(withoutRemovedSettingsKeys({ ...current, adwords_refresh_token })), 'utf-8');
               });
               return respondWithIntegrationResult({ success: true, message: 'Integrated.' });
            }
            return respondWithIntegrationResult({
               success: false,
               message: 'Error Getting the Google Ads Refresh Token. Please Try Again!',
               statusCode: 400,
            });
         } catch (error) {
            const response = getUnknownProperty(error, 'response');
            const data = getUnknownProperty(response, 'data');
            let errorMsg = getUnknownProperty(data, 'error');
            if (typeof errorMsg !== 'string' || !errorMsg) {
               errorMsg = 'Unknown error retrieving Google Ads refresh token.';
            } else if (errorMsg.includes('redirect_uri_mismatch')) {
               errorMsg += ` Redirected URL: ${redirectURL}`;
            }
            logger.error('[Error] Getting Google Ads Refresh Token!', undefined, { reason: errorMsg, redirectURL });
            return respondWithIntegrationResult({
               success: false,
               message: 'Error Saving the Google Ads Refresh Token. Please Try Again!',
               statusCode: 400,
            });
         }
      }

      return respondWithIntegrationResult({
         success: false,
         message: 'No Code Provided By Google. Please Try Again!',
         statusCode: 400,
      });
   } catch (error) {
      logger.error('Getting Google Ads Refresh Token: ', error instanceof Error ? error : new Error(String(error)));
      return respondWithIntegrationResult({
         success: false,
         message: 'Error Getting Google Ads Refresh Token. Please Try Again!',
         statusCode: 400,
      });
   }
};

const validateAdwordsIntegration = async (req: Request, ctx: ApiContext) => {
   const denied = requireAuth(req, ctx);
   if (denied) { return denied; }
   const errMsg = 'Error Validating Google Ads Integration. Please make sure your provided data are correct!';
   const { developer_token, account_id } = ((await readJson(req)) ?? {}) as {
      developer_token?: string;
      account_id?: string;
   };
   if (!developer_token || !account_id) {
      return fail(400, 'BAD_REQUEST', 'Please Provide the Google Ads Developer Token and Test Account ID', ctx);
   }
   try {
      const cryptr = new Cryptr(process.env.SECRET as string);
      const trimmedDeveloperToken = developer_token.trim();
      const trimmedAccountId = account_id.trim();
      const encryptedDeveloperToken = cryptr.encrypt(trimmedDeveloperToken);
      const encryptedAccountId = cryptr.encrypt(trimmedAccountId);

      const adwordsCreds = await getAdwordsCredentials();
      if (!adwordsCreds || !adwordsCreds.client_id || !adwordsCreds.client_secret || !adwordsCreds.refresh_token) {
         throw new Error('Missing Google Ads OAuth credentials.');
      }

      const testCredentials: AdwordsCredentials = {
         ...adwordsCreds,
         developer_token: trimmedDeveloperToken,
         account_id: trimmedAccountId,
      };

      const keywords = await getAdwordsKeywordIdeas(
         testCredentials,
         { country: 'US', language: '1000', keywords: ['compress'], seedType: 'custom' },
         true,
      );

      if (!keywords || !Array.isArray(keywords)) {
         return fail(400, 'BAD_REQUEST', errMsg, ctx);
      }

      // Re-read under the lock, so the write keeps any settings saved while Google was answering
      await withSettingsLock(async () => {
         const current = await readSettingsFile() as SettingsType;
         const securedSettings = {
            ...current,
            adwords_developer_token: encryptedDeveloperToken,
            adwords_account_id: encryptedAccountId,
         };
         await atomicWriteFile(`${process.cwd()}/data/settings.json`, JSON.stringify(withoutRemovedSettingsKeys(securedSettings)), 'utf-8');
      });

      return json({ valid: true });
   } catch (error) {
      logger.error('Validating Google Ads Integration: ', error instanceof Error ? error : new Error(String(error)));
      // Show the reason (for example a rejected developer token or account) so the user knows what to fix.
      // The messages come from our own checks or Google's API error text, never from the stored secrets.
      const reason = error instanceof Error && error.message ? error.message : '';
      return fail(400, 'BAD_REQUEST', reason ? `${errMsg} Reason: ${reason}` : errMsg, ctx);
   }
};

// The Google OAuth callback (GET with ?code=) is public and is checked by its one-time state value; every other call needs a session or API key.
const adwordsGet = (req: Request, ctx: ApiContext) => (
   (getParam(req, 'code') ?? '').trim() ? getAdwordsRefreshToken(req, ctx) : beginAdwordsIntegration(req, ctx)
);

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'adwords', auth: false, GET: adwordsGet, POST: validateAdwordsIntegration });
