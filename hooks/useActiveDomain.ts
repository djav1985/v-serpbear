import { useMemo } from 'react';
import type { NextRouter } from 'next/router';
import { safeJsonParse } from '../utils/safeJsonParse';

type DomainsResult = { domains?: DomainType[] } | null | undefined;

/**
 * Resolves the domain matching the current route slug from the fetched domains list.
 * Returns null while domains are loading or when no domain matches.
 */
export const useActiveDomain = (router: NextRouter, domainsData: DomainsResult): DomainType|null => {
   const slug = router.query?.slug;
   return useMemo(() => {
      let active:DomainType|null = null;
      if (domainsData?.domains && slug) {
         active = domainsData.domains.find((x:DomainType) => x.slug === slug) || null;
      }
      return active;
   }, [slug, domainsData]);
};

/** True when the active domain has its own Search Console service-account credentials. */
export const useDomainHasScAPI = (activeDomain: DomainType|null): boolean => useMemo(() => {
   const domainSc = safeJsonParse<DomainSearchConsole | null>(activeDomain?.search_console, null);
   return !!(domainSc?.client_email && domainSc?.private_key);
}, [activeDomain]);
