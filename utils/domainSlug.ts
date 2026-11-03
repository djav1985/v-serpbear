/**
 * Builds the URL slug for a tracked domain. Hyphens become underscores first, then dots become hyphens,
 * so the slug can be turned back into the domain (see resolveDomainIdentifier in utils/searchConsole.ts).
 * The ideas-file migration (database/migrations/1715920000000-update-ideas-domain-slug.js) repeats this rule
 * because migrations run as plain Node without TypeScript; a test keeps the two in step.
 */
export const toDomainSlug = (hostname: string): string => hostname
   .replaceAll('-', '_')
   .replaceAll('.', '-')
   .replaceAll('/', '-');

export default toDomainSlug;
