import { logger } from './logger';
import { normalizeHostFromString } from './validators/hostname';

const URL_KEYS = [
   'website',
   'link',
   'url',
   'result_link',
   'data_website',
   'share_link',
   'maps_website',
   'place_link',
   'business_website',
];

const POSITION_KEYS = ['position', 'rank', 'index', 'block_position'];

const KEY_HINTS = ['local', 'map', 'place'];

export type LocalResultEntry = Record<string, unknown> & {
   position?: number | string;
};

const toNumber = (value: unknown): number | null => {
   if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
   }
   if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
         return parsed;
      }
   }
   return null;
};

export const normaliseDomainHost = (domain: string): string | null => normalizeHostFromString(domain);

const normaliseCandidateHost = (value: string): string | null => normalizeHostFromString(value);

export const doesUrlMatchDomainHost = (domainHost: string, value: string): boolean => {
   const candidateHost = normaliseCandidateHost(value);
   if (!candidateHost) { return false; }
   if (candidateHost.includes('google.')) { return false; }
   return candidateHost === domainHost
      || candidateHost.replace(/^www\./i, '') === domainHost.replace(/^www\./i, '');
};

const isLikelyLocalResult = (entry: unknown): entry is LocalResultEntry => {
   if (!entry || typeof entry !== 'object') { return false; }
   const candidate = entry as LocalResultEntry;
   return 'title' in candidate || 'link' in candidate || 'website' in candidate || 'data_id' in candidate;
};

const collectLocalArrays = (source: unknown, depth: number = 0): LocalResultEntry[][] => {
   if (!source || typeof source !== 'object' || depth > 3) {
      return [];
   }

   const results: LocalResultEntry[][] = [];
   const container = source as Record<string, unknown>;

   for (const [key, value] of Object.entries(container)) {
      if (!value) { continue; }
      const lowerKey = key.toLowerCase();
      const hasHint = KEY_HINTS.some((hint) => lowerKey.includes(hint));

      // Only collect arrays if the KEY contains a hint (local, map, place)
      if (Array.isArray(value) && hasHint) {
         const filtered = value.filter(isLikelyLocalResult);
         if (filtered.length > 0) {
            results.push(filtered);
            continue;
         }
      }

      if (typeof value === 'object' && hasHint) {
         results.push(...collectLocalArrays(value, depth + 1));
      }
   }

   return results;
};

export const extractLocalResultsFromPayload = (payload: unknown, debug = false): LocalResultEntry[] => {
   if (!payload || typeof payload !== 'object') {
      return [];
   }

   const container = payload as Record<string, unknown>;
   const directCandidates: LocalResultEntry[][] = [];

   const register = (value: unknown) => {
      if (Array.isArray(value)) {
         const filtered = value.filter(isLikelyLocalResult);
         if (filtered.length > 0) {
            directCandidates.push(filtered);
         }
      }
   };

   register(container.local_results);
   register(container.localResults);
   register((container.local_results as { results?: any[] })?.results);
   register((container.local_results as { local_results?: any[] })?.local_results);
   register((container.local_results as { places?: any[] })?.places);
   register((container.local_pack as { results?: any[] })?.results);
   register(container.maps_results);
   register(container.map_results);
   register(container.places_results);
   register(container.place_results);
   register((container.results as { local_results?: any[] })?.local_results);
   // Mobile-specific variations
   register(container.mobile_local_results);
   register(container.local_map);
   register((container.local_map as { places?: any[] })?.places);

   if (directCandidates.length === 0) {
      directCandidates.push(...collectLocalArrays(container));
   }

   if (directCandidates.length === 0) {
      if (debug) {
         logger.debug('No local results found in map pack payload', { availableKeys: Object.keys(container) });
      }
      return [];
   }

   if (debug) {
      logger.debug(`Found ${directCandidates[0].length} local results in map pack`);
   }

   return directCandidates[0];
};

const deriveRank = (entry: LocalResultEntry, index: number): number => {
   for (const key of POSITION_KEYS) {
      if (key in entry) {
         const value = toNumber(entry[key as keyof LocalResultEntry]);
         if (value !== null) {
            return value;
         }
      }
   }
   return index + 1;
};

const extractCandidateUrls = (entry: LocalResultEntry): string[] => {
   const candidates = new Set<string>();

   for (const key of URL_KEYS) {
      const value = entry[key];
      if (typeof value === 'string' && value.trim()) {
         candidates.add(value.trim());
      }
   }

   if (typeof entry.domain === 'string' && entry.domain.trim()) {
      candidates.add(entry.domain.trim());
   }

   return Array.from(candidates);
};

const extractCandidateTitles = (entry: LocalResultEntry): string[] => {
   const candidates = new Set<string>();
   
   const titleKeys = ['title', 'name', 'business_name', 'place_name'];
   for (const key of titleKeys) {
      const value = entry[key];
      if (typeof value === 'string' && value.trim()) {
         candidates.add(value.trim().toLowerCase());
      }
   }
   
   return Array.from(candidates);
};

export const computeMapPackTop3 = (domain: string, localResultsInput: unknown, businessName?: string | null): boolean => {
   const domainHost = normaliseDomainHost(domain);
   if (!domainHost) {
      return false;
   }

   const localResults = Array.isArray(localResultsInput)
      ? (localResultsInput.filter(isLikelyLocalResult) as LocalResultEntry[])
      : extractLocalResultsFromPayload(localResultsInput);

   if (!localResults || localResults.length === 0) {
      return false;
   }

   const ranked = localResults
      .map((entry, index) => ({ entry, rank: deriveRank(entry, index) }))
      .filter(({ rank }) => Number.isFinite(rank))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3);

   for (const { entry } of ranked) {
      const urls = extractCandidateUrls(entry);
      
      // First, try to match by URL
      for (const url of urls) {
         if (doesUrlMatchDomainHost(domainHost, url)) {
            return true;
         }
      }
      
      // If URL didn't match (or no URL available) and business_name is provided, use it as fallback
      if (businessName && businessName.trim()) {
         const titles = extractCandidateTitles(entry);
         const normalizedBusinessName = businessName.trim().toLowerCase();
         for (const title of titles) {
            if (title === normalizedBusinessName) {
               return true;
            }
         }
      }
   }

   return false;
};
