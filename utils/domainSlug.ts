/**
 * Builds the URL slug for a tracked domain (used in page URLs and the domain.slug column, never in the API).
 * Hyphens become underscores first, then dots become hyphens.
 * The ideas-file migration (database/migrations/1715920000000-update-ideas-domain-slug.js) repeats this rule
 * because migrations run as plain Node without TypeScript; a test keeps the two in step.
 */
export const toDomainSlug = (hostname: string): string => hostname
   .replaceAll('-', '_')
   .replaceAll('.', '-')
   .replaceAll('/', '-');

export default toDomainSlug;

/** Characters a real domain name may contain (letters, digits, dots, hyphens). Checked before a name reaches a file path. */
export const SAFE_DOMAIN_NAME = /^[a-zA-Z0-9.-]+$/;
