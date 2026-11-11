import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import generateEmail from '../generateEmail';
import parseKeywords from '../parseKeywords';
import getdomainStats from '../domains';
import { reserveEmailSend } from '../emailThrottle';
import { getAppSettings } from '../appSettings';
import { trimStringProperties, trimString, sanitizeSmtpHost } from '../security';
import { buildMailer } from '../mailer';
import { logger } from '../logger';
import normalizeDomainBooleans from '../normalizeDomain';
import { fail, json, readJson, type ApiContext } from '../apiLogging';

export const sendDigestEmails = async (req: Request, ctx: ApiContext) => {
   const rawBody = await readJson(req);
   const rawDomain = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>).domain
      : undefined;
   if (rawDomain !== undefined && typeof rawDomain !== 'string') {
      return fail(400, 'BAD_REQUEST', 'domain must be a single domain name.', ctx);
   }
   // Domains are stored trimmed and lowercase
   const reqDomain = (rawDomain || '').trim().toLowerCase();
   try {
      const settings = await getAppSettings();
      const normalizedSettings: SettingsType = trimStringProperties({ ...settings });

      const sanitizedHost = sanitizeSmtpHost(normalizedSettings.smtp_server);
      const sanitizedPort = normalizedSettings.smtp_port;

      normalizedSettings.smtp_server = sanitizedHost;
      normalizedSettings.smtp_port = sanitizedPort;
      normalizedSettings.smtp_tls_servername = sanitizeSmtpHost(normalizedSettings.smtp_tls_servername);

      // Recipients are set per domain (notification_emails), so only the SMTP server is needed here
      if (!sanitizedHost || !sanitizedPort) {
         return fail(400, 'BAD_REQUEST', 'SMTP has not been setup properly!', ctx);
      }

      let sentCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      // A domain takes part only when scraping is enabled.
      const isNotifiable = (domain: DomainType) => domain.scrapeEnabled;

      // A send skipped on purpose (no address, or throttled) is counted apart from a failure, so skipped
      // domains never turn the response into an error.
      const notifyDomain = async (domain: DomainType) => {
         try {
            const outcome = await sendNotificationEmail(domain, normalizedSettings);
            if (outcome === 'sent') { sentCount++; } else { skippedCount++; }
         } catch (error) {
            failedCount++;
            const domainName = domain?.domain || 'unknown domain';
            logger.error(`Failed to send notification for ${domainName}`, error instanceof Error ? error : new Error(String(error)));
         }
      };

      if (reqDomain) {
         const theDomain = await Domain.findOne({ where: { domain: reqDomain } });
         if (!theDomain) {
            return fail(404, 'NOT_FOUND', 'Domain not found.', ctx);
         }
         const normalizedDomain = normalizeDomainBooleans(theDomain.get({ plain: true }) as DomainType);
         if (isNotifiable(normalizedDomain)) {
            await notifyDomain(normalizedDomain);
         }
      } else {
         const allDomains: Domain[] = await Domain.findAll();
         if (allDomains && allDomains.length > 0) {
            const domains = allDomains.map((el) => normalizeDomainBooleans(el.get({ plain: true }) as DomainType));
            for (const domain of domains) {
               if (isNotifiable(domain)) {
                  await notifyDomain(domain);
               }
            }
         }
      }

      // Only real send failures are errors: every eligible domain failed and none was sent
      if (failedCount > 0 && sentCount === 0) {
         return fail(500, 'INTERNAL_SERVER_ERROR', 'All notification emails failed to send. Please check your SMTP configuration.', ctx);
      }

      // No eligible domains at all: tell the user nothing was sent
      if (sentCount === 0 && skippedCount === 0) {
         return json({ success: true, error: null, sent: 0, skipped: 0, message: 'No domains are enabled for notifications.' });
      }

      return json({ success: true, error: null, sent: sentCount, skipped: skippedCount });
   } catch (error) {
      logger.error('Error sending notification emails', error instanceof Error ? error : new Error(String(error)));
      // A missing or invalid SMTP host is answered with 400 before any send (see the check above)
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Sending Notification Email.', ctx);
   }
};

/**
 * Sends the notification email for one domain. Resolves to 'sent', or to 'skipped' when the domain has no
 * notification address or the throttle held it back. A domain with no address never falls back to the global address.
 */
const sendNotificationEmail = async (domain: DomainType, settings: SettingsType): Promise<'sent' | 'skipped'> => {
   const domainName = domain.domain;
   const recipients = trimString(domain.notification_emails);
   if (!recipients) {
      logger.info(`[EMAIL] Skipping email for ${domainName}: no notification address set for this domain`);
      return 'skipped';
   }

   // The SMTP host was validated by sendDigestEmails() before any domain is processed, so a bad setup never reaches the
   // throttle and never uses up a domain's daily allowance.

   // Check the throttle and reserve the send in one step, so overlapping runs cannot both send
   const reservation = await reserveEmailSend(domainName);
   if (!reservation.reserved) {
      logger.info(`[EMAIL] Skipping email for ${domainName}: ${reservation.reason}`);
      return 'skipped';
   }

   // Everything after the reservation is inside the try, so any failure gives the slot back
   try {
      const { transporter, fromEmail } = buildMailer(settings);
      const query = { where: { domain: domainName } };
      const domainKeywords:Keyword[] = await Keyword.findAll(query);
      const keywordsArray = domainKeywords.map((el) => el.get({ plain: true }));
      const keywords: KeywordType[] = parseKeywords(keywordsArray);
      
      // Calculate domain stats to ensure email shows correct tracker summary
      const domainsWithStats = await getdomainStats([domain]);
      const domainWithStats = domainsWithStats[0] || domain;
      
      const emailHTML = await generateEmail(domainWithStats, keywords, settings);

      await transporter.sendMail({
         from: fromEmail,
         to: recipients,
         subject: `[${domainName}] Keyword Positions Update`,
         html: emailHTML,
      });

      logger.info(`[EMAIL] Successfully sent notification for ${domainName}`);
      return 'sent';

   } catch (error:any) {
      // The send did not happen, so give back the slot it reserved
      await reservation.release();
      logger.error('Error sending notification email', error instanceof Error ? error : new Error(String(error)), { domain: domainName });
      throw error; // Re-throw to let caller handle
   }
};
