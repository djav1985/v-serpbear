/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Domain from '../../../database/models/domain';
import verifyUser from '../../../utils/verifyUser';
import { getAppSettings } from '../../../utils/appSettings';
import { trimStringProperties, trimString, sanitizeSmtpHost } from '../../../utils/security';
import { buildMailer } from '../../../utils/mailer';
import normalizeDomainBooleans from '../../../utils/normalizeDomain';
import generateKeywordIdeasEmail, { KeywordIdeasEmailKeyword } from '../../../utils/generateKeywordIdeasEmail';
import { getBranding } from '../../../utils/branding';
import { logger } from '../../../utils/logger';
import { withApiLogging } from '../../../utils/apiLogging';
import { errorResponse } from '../../../utils/api/response';
import { takeRateLimitToken } from '../../../utils/rateLimit';

// Same cap as the ideas list (pages/api/ideas.ts)
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

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }

   if (req.method !== 'POST') {
      return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
   }

   return emailKeywordIdeas(req, res);
}

export default withApiLogging(handler, { name: 'ideas/email' });

const emailKeywordIdeas = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (req.body !== undefined && req.body !== null && (typeof req.body !== 'object' || Array.isArray(req.body))) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Request body must be a JSON object.', requestId));
   }
   const body = (req.body || {}) as EmailKeywordIdeasRequest;
   const { platformName } = getBranding();
   const targetDomain = trimString(body.domain);
   if (!targetDomain) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'A domain is required to email keyword ideas.', requestId));
   }

   if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Select at least one keyword idea to email.', requestId));
   }

   if (body.keywords.length > MAX_EMAIL_KEYWORDS) {
      return res.status(400).json(errorResponse('BAD_REQUEST', `Select at most ${MAX_EMAIL_KEYWORDS} keyword ideas to email.`, requestId));
   }
   if (body.keywords.some((keyword) => !keyword || typeof keyword !== 'object' || Array.isArray(keyword))) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Each keyword idea must be an object.', requestId));
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
         return res.status(400).json(errorResponse('BAD_REQUEST', 'SMTP has not been setup properly!', requestId));
      }

      const domainRecord = await Domain.findOne({ where: { domain: targetDomain } })
         || await Domain.findOne({ where: { slug: targetDomain } });

      if (!domainRecord) {
         return res.status(404).json(errorResponse('NOT_FOUND', 'Domain not found.', requestId));
      }

      const domainPlain = domainRecord.get({ plain: true }) as DomainType;
      const normalizedDomain = normalizeDomainBooleans(domainPlain);

      const notificationEmails = trimString(normalizedDomain.notification_emails);
      if (!notificationEmails) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Notification email not configured for this domain.', requestId));
      }

      if (!normalizedSettings.smtp_server) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'SMTP has not been setup properly!', requestId));
      }

      if (!takeRateLimitToken(`ideas-email:${normalizedDomain.domain}`, IDEAS_EMAILS_PER_HOUR, 60 * 60 * 1000)) {
         return res.status(429).json(errorResponse('TOO_MANY_REQUESTS', 'Too many keyword idea emails for this domain. Please try again later.', requestId));
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

      logger.info(`Sent keyword ideas email for ${normalizedDomain.domain}`);
      return res.status(200).json({ success: true, error: null });
   } catch (error) {
      logger.error('Error sending keyword ideas email', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error sending keyword ideas email.', requestId));
   }
};
