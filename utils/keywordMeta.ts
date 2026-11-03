import { formatLocation, getLocationCountry } from './location';

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
   const allLocations = keywords.map((keyword) => (keyword.location || '').trim()).filter((location) => location !== '');
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
