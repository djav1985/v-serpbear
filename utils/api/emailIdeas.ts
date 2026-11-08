import Domain from '../../database/models/domain';
import { getAppSettings } from '../appSettings';
import { trimStringProperties, trimString, sanitizeSmtpHost } from '../security';
import { buildMailer } from '../mailer';
import normalizeDomainBooleans from '../normalizeDomain';
import generateKeywordIdeasEmail, { KeywordIdeasEmailKeyword } from '../generateKeywordIdeasEmail';
import { getBranding } from '../branding';
import { logger } from '../logger';
import { fail, json, readJson, type ApiContext } from '../apiLogging';
import { takeRateLimitToken } from '../rateLimit';

// Same cap as the ideas list (pages/api/google/ideas.ts)
const MAX_EMAIL_KEYWORDS = 1000;
// Idea emails stay off the digest throttle (utils/emailThrottle) but are bounded on their own, per domain
const IDEAS_EMAILS_PER_HOUR = 10;

type EmailKeywordIdeasRequest = {
   domain?: string;
   keywords?: KeywordIdeasEmailKeyword[];
};

const normalizeKeywords = (keywords: KeywordIdeasEmailKeyword[] = []): KeywordIdeasEmailKeyword[] => keywords.map((keyword) => {
   const monthlyVolumes: Record<string, number> = {};
   const sourceVolumes = keyword.monthlySearchVolumes || {};
   Object.entries(sourceVolumes).forEach(([period, value]) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      if (typeof numeric === 'number' && Number.isFinite(numeric)) {
         monthlyVolumes[period] = numeric;
      }
   });
   const parsedCompetitionIndex = typeof keyword.competitionIndex === 'number'
      ? keyword.competitionIndex
      : (keyword.competitionIndex !== undefined && keyword.competitionIndex !== null && keyword.competitionIndex !== ''
         ? Number(keyword.competitionIndex)
         : undefined);
   const normalizedCompetitionIndex = typeof parsedCompetitionIndex === 'number' && Number.isFinite(parsedCompetitionIndex)
      ? parsedCompetitionIndex
      : undefined;
   return {
      keyword: trimString(keyword.keyword),
      avgMonthlySearches: typeof keyword.avgMonthlySearches === 'number'
         ? keyword.avgMonthlySearches
         : (Number.isFinite(Number(keyword.avgMonthlySearches)) ? Number(keyword.avgMonthlySearches) : undefined),
      monthlySearchVolumes: monthlyVolumes,
      competition: trimString(keyword.competition) || undefined,
      competitionIndex: normalizedCompetitionIndex,
   };
});

export const sendIdeasEmail = async (req: Request, ctx: ApiContext) => {
   const rawBody = await readJson(req);
   if (rawBody !== undefined && rawBody !== null && (typeof rawBody !== 'object' || Array.isArray(rawBody))) {
      return fail(400, 'BAD_REQUEST', 'Request body must be a JSON object.', ctx);
   }
   const body = (rawBody || {}) as EmailKeywordIdeasRequest;
   const { platformName } = getBranding();
   const targetDomain = trimString(body.domain);
   if (!targetDomain) {
      return fail(400, 'BAD_REQUEST', 'A domain is required to email keyword ideas.', ctx);
   }

   if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
      return fail(400, 'BAD_REQUEST', 'Select at least one keyword idea to email.', ctx);
   }

   if (body.keywords.length > MAX_EMAIL_KEYWORDS) {
      return fail(400, 'BAD_REQUEST', `Select at most ${MAX_EMAIL_KEYWORDS} keyword ideas to email.`, ctx);
   }
   if (body.keywords.some((keyword) => !keyword || typeof keyword !== 'object' || Array.isArray(keyword))) {
      return fail(400, 'BAD_REQUEST', 'Each keyword idea must be an object.', ctx);
   }

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

      const domainRecord = await Domain.findOne({ where: { domain: targetDomain } })
         || await Domain.findOne({ where: { slug: targetDomain } });

      if (!domainRecord) {
         return fail(404, 'NOT_FOUND', 'Domain not found.', ctx);
      }

      const domainPlain = domainRecord.get({ plain: true }) as DomainType;
      const normalizedDomain = normalizeDomainBooleans(domainPlain);

      const notificationEmails = trimString(normalizedDomain.notification_emails);
      if (!notificationEmails) {
         return fail(400, 'BAD_REQUEST', 'Notification email not configured for this domain.', ctx);
      }

      if (!normalizedSettings.smtp_server) {
         return fail(400, 'BAD_REQUEST', 'SMTP has not been setup properly!', ctx);
      }

      if (!takeRateLimitToken(`ideas-email:${normalizedDomain.domain}`, IDEAS_EMAILS_PER_HOUR, 60 * 60 * 1000)) {
         return fail(429, 'TOO_MANY_REQUESTS', 'Too many keyword idea emails for this domain. Please try again later.', ctx);
      }

      const { transporter, fromEmail } = buildMailer(normalizedSettings);
      const normalizedKeywords = normalizeKeywords(body.keywords);
      const emailHTML = generateKeywordIdeasEmail({
         domain: normalizedDomain.domain,
         keywords: normalizedKeywords,
         platformName,
      });

      await transporter.sendMail({
         from: fromEmail,
         to: notificationEmails,
       subject: `[${normalizedDomain.domain}] Keyword Ideas`,
         html: emailHTML,
      });

      logger.info(`[EMAIL] Sent keyword ideas email for ${normalizedDomain.domain}`);
      return json({ success: true, error: null });
   } catch (error) {
      logger.error('Error sending keyword ideas email', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error sending keyword ideas email.', ctx);
   }
};
