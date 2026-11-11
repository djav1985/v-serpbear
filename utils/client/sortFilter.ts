type SortDirection = 'asc' | 'desc';

export const sortByNumericField = <T>(items: T[], getValue: (item: T) => number, direction: SortDirection = 'asc'): T[] => (
   [...items].sort((a, b) => {
      const delta = getValue(a) - getValue(b);
      return direction === 'asc' ? delta : -delta;
   })
);

export const sortByStringField = <T>(items: T[], getValue: (item: T) => string, direction: SortDirection = 'asc'): T[] => (
   [...items].sort((a, b) => {
      const delta = getValue(a).localeCompare(getValue(b));
      return direction === 'asc' ? delta : -delta;
   })
);

// ── Predicates (single-item checks) ─────────────────────────────────────────

export const matchesCountry = (keywordCountry: string, countries: string[]): boolean => (
   countries.length === 0 || countries.includes(keywordCountry)
);

export const matchesSearch = (keyword: string, search: string): boolean => {
   if (!search) { return true; }
   const normalizedKeyword = keyword.toLowerCase();
   const normalizedSearch = search.toLowerCase();
   return normalizedKeyword.includes(normalizedSearch);
};

// Sentinel value the tag filter uses for "keywords that have no tags".
export const NO_TAGS_FILTER = '__no_tags__';

export const matchesTags = (keywordTags: string[], tags: string[]): boolean => {
   if (tags.length === 0) { return true; }
   if (keywordTags.length === 0) { return tags.includes(NO_TAGS_FILTER); }
   return tags.some((tag) => keywordTags.includes(tag));
};

// "No Tags" cannot be combined with specific tags. Picking it clears the other selections,
// and picking a specific tag while it is selected removes it.
export const resolveTagSelection = (previous: string[], next: string[]): string[] => {
   const newlyAdded = next.filter((tag) => !previous.includes(tag));
   if (newlyAdded.includes(NO_TAGS_FILTER)) { return [NO_TAGS_FILTER]; }
   return next.filter((tag) => tag !== NO_TAGS_FILTER);
};

const sortByPositionWithFallback = <T extends { position: number }>(items: T[], direction: SortDirection): T[] => {
   const keywordsWithFallback = items.map((item) => ({ ...item, position: item.position === 0 ? 111 : item.position }));
   const sortedItems = sortByNumericField(keywordsWithFallback, (item) => item.position, direction);
   return sortedItems.map((item) => ({ ...item, position: item.position === 111 ? 0 : item.position }));
};

/**
 * Sort Search Console keywords by user's given input.
 * @param {SCKeywordType[]} theKeywords - The Keywords to sort.
 * @param {string} sortBy - The sort method.
 * @returns {SCKeywordType[]}
 */
export const SCsortKeywords = (theKeywords:SCKeywordType[], sortBy:string) : SCKeywordType[] => {
   const baseKeywords = [...theKeywords];
   let sortedItems: SCKeywordType[] = [];
   switch (sortBy) {
      case 'imp_asc':
            sortedItems = sortByNumericField(baseKeywords, (item) => item.impressions ?? 0, 'asc');
            break;
      case 'imp_desc':
            sortedItems = sortByNumericField(baseKeywords, (item) => item.impressions ?? 0, 'desc');
            break;
      case 'visits_asc':
            sortedItems = sortByNumericField(baseKeywords, (item) => item.clicks ?? 0, 'asc');
            break;
      case 'visits_desc':
            sortedItems = sortByNumericField(baseKeywords, (item) => item.clicks ?? 0, 'desc');
            break;
      case 'ctr_asc':
            sortedItems = sortByNumericField(baseKeywords, (item) => item.ctr ?? 0, 'asc');
            break;
      case 'ctr_desc':
            sortedItems = sortByNumericField(baseKeywords, (item) => item.ctr ?? 0, 'desc');
            break;
      case 'pos_asc':
            sortedItems = sortByPositionWithFallback(baseKeywords, 'asc');
            break;
      case 'pos_desc':
            sortedItems = sortByPositionWithFallback(baseKeywords, 'desc');
            break;
      case 'alpha_desc':
            sortedItems = sortByStringField(baseKeywords, (item) => item.keyword, 'desc');
            break;
      case 'alpha_asc':
            sortedItems = sortByStringField(baseKeywords, (item) => item.keyword, 'asc');
         break;
      default:
            return theKeywords;
   }

   return [...sortedItems];
};

/**
 * Filters the keywords by country, search string or tags.
 * @param {SCKeywordType[]} keywords - The keywords.
 * @param {KeywordFilters} filterParams - The user Selected filter object.
 * @returns {SCKeywordType[]}
 */
export const SCfilterKeywords = (keywords: SCKeywordType[], filterParams: KeywordFilters):SCKeywordType[] => {
   const searchTerm = (filterParams.search || '').trim().toLowerCase();
   return keywords.filter((keyword) => (
      matchesCountry(keyword.country, filterParams.countries)
      && (!searchTerm || keyword.keyword.toLowerCase().includes(searchTerm))
   ));
};

export const normalizeIdeaTag = (tag: string): string => tag.replace(/\s*\(\d+\)/, '').trim();

const reversePhrase = (value: string): string => value.split(' ').reverse().join(' ');

export const matchesIdeaTags = (keyword: string, tags: string[]): boolean => {
   if (tags.length === 0) { return true; }
   const normalizedKeyword = keyword.toLowerCase();
   return tags.some((tag) => {
      const normalizedTag = normalizeIdeaTag(tag).toLowerCase();
      if (!normalizedTag) { return false; }
      const reversedTag = reversePhrase(normalizedTag);
      return normalizedKeyword.includes(normalizedTag) || normalizedKeyword.includes(reversedTag);
   });
};

