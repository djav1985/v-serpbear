import { formatLocation, getLocationCountry, normalizeLocation } from './location';

export type TrackerDevice = 'desktop' | 'mobile';

type AddPayloadItem = {
   keyword: string,
   country: string,
}

type BuildAddPayloadOptions = {
   items: AddPayloadItem[],
   domain: string,
   devices: TrackerDevice[],
   tags: string[],
   location: string,
}

// Whether the scraper selected in settings supports city-level locations
export const scraperAllowsCity = (settings?: SettingsType): boolean => (
   !!settings?.available_scapers?.find((scraper) => scraper.value === settings.scraper_type)?.allowsCity
);

// Unique, non-empty tags across a domain's keywords
export const getDomainTags = (keywords: KeywordType[] = []): string[] => {
   const allTags = keywords.flatMap((keyword) => keyword.tags || []).filter((tag) => tag && tag.trim() !== '');
   return [...new Set(allTags)];
};

// Unique, non-empty locations used by a domain's keywords
export const getDomainLocations = (keywords: KeywordType[] = []): string[] => {
   const allLocations = keywords.map((keyword) => normalizeLocation(keyword.location)).filter((location) => location !== '');
   return [...new Set(allLocations)].sort();
};

// One payload row per item per chosen device, sharing the chosen tags.
// An empty location means "each keyword's own country", matching the previous default.
// A chosen location sets the keyword's country too, because scrapers search in that country's market.
export const buildKeywordAddPayloads = ({ items, domain, devices, tags, location }: BuildAddPayloadOptions): KeywordAddPayload[] => (
   items.flatMap((item) => devices.map((device) => ({
      keyword: item.keyword,
      device,
      country: getLocationCountry(location) || item.country,
      domain,
      tags: tags.join(', '),
      location: location || formatLocation({ country: item.country }),
   })))
);

type LocationTarget = {
   ID: number,
   keyword: string,
   domain: string,
   country: string,
   device: string,
}

// Same keyword, country, device and domain is one tracked keyword
const trackingKey = (item: Pick<LocationTarget, 'domain' | 'keyword' | 'country' | 'device'>, country: string): string => (
   [item.domain, item.keyword, country, item.device].join('|')
);

// Decides which selected keywords can move to a new location without duplicating a tracked keyword.
// Keywords whose country stays the same are kept as they are. A keyword that would change into a
// tracked keyword (another row, or an earlier change in this batch) is skipped.
export const planLocationUpdate = (
   selected: LocationTarget[],
   others: LocationTarget[],
   locationCountry: string,
): { acceptedIDs: number[], skipped: string[] } => {
   const taken = new Set(others.map((item) => trackingKey(item, item.country)));
   const acceptedIDs: number[] = [];
   const skipped: string[] = [];

   const targetCountry = (item: LocationTarget) => locationCountry || item.country;
   const unchanged = selected.filter((item) => targetCountry(item) === item.country);
   const changed = selected.filter((item) => targetCountry(item) !== item.country);

   unchanged.forEach((item) => {
      taken.add(trackingKey(item, item.country));
      acceptedIDs.push(item.ID);
   });
   changed.forEach((item) => {
      const key = trackingKey(item, targetCountry(item));
      if (taken.has(key)) {
         skipped.push(item.keyword);
         return;
      }
      taken.add(key);
      acceptedIDs.push(item.ID);
   });

   return { acceptedIDs: acceptedIDs.sort((a, b) => a - b), skipped };
};

// Toast text for a bulk location change, e.g. "Updated 2 keywords. Skipped 1 already tracked there: alpha."
export const getLocationUpdateMessage = (updatedCount: number, skipped: string[] = []): string => {
   const updatedText = `${updatedCount} keyword${updatedCount === 1 ? '' : 's'}`;
   if (skipped.length === 0) {
      return `Updated ${updatedText}.`;
   }
   const skippedText = `${skipped.length} already tracked in that location: ${skipped.join(', ')}.`;
   return updatedCount === 0 ? `No keywords changed. ${skippedText}` : `Updated ${updatedText}. Skipped ${skippedText}`;
};

// Drops payloads for keyword, country and device combinations that are already tracked.
// Returns the rows to add and a readable list of what was skipped, e.g. "alpha (mobile)".
export const splitAlreadyTracked = (
   payloads: KeywordAddPayload[],
   trackedLookup: Record<string, boolean>,
): { payloads: KeywordAddPayload[], skipped: string[] } => {
   const kept: KeywordAddPayload[] = [];
   const skipped = new Set<string>();
   payloads.forEach((payload) => {
      if (trackedLookup[`${payload.keyword}:${payload.country}:${payload.device}`]) {
         skipped.add(`${payload.keyword} (${payload.device})`);
      } else {
         kept.push(payload);
      }
   });
   return { payloads: kept, skipped: [...skipped] };
};

// Toast text after adding keywords. Keeps the original wording when nothing was skipped.
export const getAddKeywordsMessage = (addedCount: number, skipped: string[] = []): string => {
   if (skipped.length === 0) {
      return 'Keywords Added Successfully!';
   }
   const skippedText = `${skipped.length} already tracked: ${skipped.join(', ')}.`;
   return addedCount === 0 ? `No keywords added. ${skippedText}` : `Added ${addedCount} keyword${addedCount === 1 ? '' : 's'}. Skipped ${skippedText}`;
};
