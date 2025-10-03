import crypto from 'crypto';
import Domain from '../database/models/domain';

const SHARE_TOKEN_BYTES = 32;
const DEFAULT_TOKEN_TTL_HOURS = 24 * 7; // one week

export type ShareLinkResult = {
   token: string;
   url: string;
   expiresAt: string;
};

const getSecret = (): string => {
   const secret = process.env.SECRET;
   if (!secret) {
      throw new Error('SECRET environment variable is not configured.');
   }
   return secret;
};

export const hashShareToken = (token: string): string => {
   const secret = getSecret();
   return crypto.createHmac('sha256', secret).update(token).digest('hex');
};

const resolveBaseUrl = (): string => {
   const base = process.env.NEXT_PUBLIC_APP_URL || '';
   return base.replace(/\/$/, '');
};

const resolveExpiryDate = (): Date => {
   const configuredTtl = Number(process.env.SHARE_TOKEN_TTL_HOURS);
   const ttlHours = Number.isFinite(configuredTtl) && configuredTtl > 0
      ? configuredTtl
      : DEFAULT_TOKEN_TTL_HOURS;
   const expires = new Date();
   expires.setHours(expires.getHours() + ttlHours);
   return expires;
};

const persistShareToken = async (domainInstance: Domain, tokenHash: string, expiresAt: Date) => {
   await domainInstance.update({
      share_token_hash: tokenHash,
      share_token_expires_at: expiresAt,
   });
};

const generateRawToken = (): string => crypto.randomBytes(SHARE_TOKEN_BYTES).toString('hex');

const ensureDomainInstance = async (domain: DomainType | Domain): Promise<Domain> => {
   try {
      if (domain instanceof Domain) {
         return domain;
      }
   } catch (_error) {
      // noop - instanceof can throw if Domain is mocked in tests
   }

   if (domain && typeof (domain as Domain)?.update === 'function' && typeof (domain as Domain)?.get === 'function') {
      return domain as Domain;
   }

   if (!domain?.ID) {
      throw new Error('Domain identifier is missing.');
   }

   const found = await Domain.findByPk(domain.ID);
   if (!found) {
      throw new Error('Domain not found while generating share token.');
   }
   return found;
};

export const buildShareUrl = (token: string, pathSuffix = ''): string => {
   const baseUrl = resolveBaseUrl();
   const sanitizedSuffix = pathSuffix ? `/${pathSuffix.replace(/^\//, '')}` : '';
   if (!baseUrl) {
      return `/share/${token}${sanitizedSuffix}`;
   }
   return `${baseUrl}/share/${token}${sanitizedSuffix}`;
};

export const createDomainShareLink = async (domain: DomainType | Domain): Promise<ShareLinkResult> => {
   const domainInstance = await ensureDomainInstance(domain);
   const rawToken = generateRawToken();
   const hashedToken = hashShareToken(rawToken);
   const expiresAt = resolveExpiryDate();

   await persistShareToken(domainInstance, hashedToken, expiresAt);

   return {
      token: rawToken,
      url: buildShareUrl(rawToken),
      expiresAt: expiresAt.toISOString(),
   };
};

export const resolveDomainForShareToken = async (
   rawToken: string,
): Promise<{ domain: DomainType | null; expired: boolean }> => {
   if (!rawToken) {
      return { domain: null, expired: false };
   }

   const hashed = hashShareToken(rawToken);
   const instance = await Domain.findOne({ where: { share_token_hash: hashed } });
   if (!instance) {
      return { domain: null, expired: false };
   }

   const plain = instance.get({ plain: true }) as DomainType;
   const expiresAt = plain.share_token_expires_at ? new Date(plain.share_token_expires_at) : null;
   if (expiresAt && expiresAt.getTime() < Date.now()) {
      return { domain: null, expired: true };
   }

   return { domain: plain, expired: false };
};

export const invalidateShareToken = async (domain: DomainType | Domain) => {
   const domainInstance = await ensureDomainInstance(domain);
   await domainInstance.update({ share_token_hash: null, share_token_expires_at: null });
};

export default createDomainShareLink;
