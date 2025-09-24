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

export const normaliseDomainHost = (domain: string): string | null => {
   if (!domain) { return null; }
   try {
      const url = domain.includes('://') ? new URL(domain) : new URL(`https://${domain}`);
      return url.hostname.replace(/^www\./i, '').toLowerCase();
   } catch {
      return null;
   }
};

const normaliseCandidateHost = (value: string): string | null => {
   if (!value || typeof value !== 'string') { return null; }
   const trimmed = value.trim();
   if (!trimmed) { return null; }

   try {
      const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
      return url.hostname.replace(/^www\./i, '').toLowerCase();
   } catch {
      return null;
   }
};

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

      if (Array.isArray(value) && (hasHint || value.some(isLikelyLocalResult))) {
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

export const extractLocalResultsFromPayload = (payload: unknown): LocalResultEntry[] => {
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
   register((container.local_results as any)?.results);
   register((container.local_results as any)?.local_results);
   register((container.local_results as any)?.places);
   register((container.local_pack as any)?.results);
   register(container.maps_results);
   register(container.map_results);
   register(container.places_results);
   register(container.place_results);
   register((container.results as any)?.local_results);

   if (directCandidates.length === 0) {
      directCandidates.push(...collectLocalArrays(container));
   }

   if (directCandidates.length === 0) {
      return [];
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

export const computeMapPackTop3 = (domain: string, localResultsInput: unknown): boolean => {
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
      for (const url of urls) {
         if (doesUrlMatchDomainHost(domainHost, url)) {
            return true;
         }
      }
   }

   return false;
};

