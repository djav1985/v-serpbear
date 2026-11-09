import {
   buildKeywordAddPayloads, splitAlreadyTrackedByLocation, trackedTargetKey, type TrackerDevice,
} from 'utils/keywordMeta';

type TrackedKeywordTarget = Pick<KeywordType, 'keyword' | 'country' | 'device' | 'location'>;

/** Build add payloads and skip only targets that match the selected location and device exactly. */
export function buildAddKeywordPayloads({
   items, domain, devices, tags, location, country, tracked,
}: {
   items: { keyword: string; country: string }[];
   domain: string;
   devices: TrackerDevice[];
   tags: string[];
   location: string;
   country: string;
   tracked: TrackedKeywordTarget[];
}) {
   const lookup: Record<string, boolean> = {};
   tracked.forEach((keyword) => {
      if (keyword.keyword && keyword.country && keyword.device) {
         lookup[trackedTargetKey(keyword.keyword, keyword.country, keyword.device, keyword.location ?? '')] = true;
      }
   });
   return splitAlreadyTrackedByLocation(buildKeywordAddPayloads({ items, domain, devices, tags, location, country }), lookup);
}
