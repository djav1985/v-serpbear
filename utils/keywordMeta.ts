import { getLocationCountry } from './location';

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
   // Country picked for a country-only location (blank location); falls back to each item's country
   country?: string,
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
   const allLocations = keywords.map((keyword) => (keyword.location || '').trim()).filter((location) => location !== '');
   return [...new Set(allLocations)].sort();
};

// One payload row per item per chosen device, sharing the chosen tags.
// The location is stored as given ("City,State,Country Name", or '' for country-only). The keyword's
// country is the location's country when there is one, otherwise the picked country, otherwise the item's own.
export const buildKeywordAddPayloads = ({ items, domain, devices, tags, location, country = '' }: BuildAddPayloadOptions): KeywordAddPayload[] => (
   items.flatMap((item) => devices.map((device) => ({
      keyword: item.keyword,
      device,
      country: getLocationCountry(location) || country || item.country,
      domain,
      tags: tags.join(', '),
      location,
   })))
);

type LocationTarget = {
   ID: number,
   keyword: string,
   domain: string,
   country: string,
   device: string,
   location: string,
}

// Same domain, keyword, country, location and device is one tracking target.
const trackingKey = (item: LocationTarget, country: string, location: string): string => (
   JSON.stringify([item.domain ?? '', item.keyword ?? '', country ?? '', location ?? '', item.device ?? ''])
);

// Decides which selected keywords can move to a new location without duplicating a tracked keyword.
// A keyword that would change into an existing or earlier destination target is skipped.
export const planLocationUpdate = (
   selected: LocationTarget[],
   others: LocationTarget[],
   locationCountry: string,
   location: string,
): { acceptedIDs: number[], skipped: string[] } => {
   const taken = new Set(others.map((item) => trackingKey(item, item.country, item.location)));
   const acceptedIDs: number[] = [];
   const skipped: string[] = [];

   const targetCountry = (item: LocationTarget) => locationCountry || item.country;
   [...selected].sort((a, b) => a.ID - b.ID).forEach((item) => {
      const key = trackingKey(item, targetCountry(item), location);
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
