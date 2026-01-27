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

export const filterByCountry = <T extends { country: string }>(items: T[], countries: string[]): T[] => (
   countries.length === 0 ? [...items] : items.filter((item) => countries.includes(item.country))
);

export const filterBySearch = <T extends { keyword: string }>(
   items: T[],
   search: string,
   options: { caseSensitive?: boolean } = {}
): T[] => {
   if (!search) { return [...items]; }
   if (options.caseSensitive) {
      return items.filter((item) => item.keyword.includes(search));
   }
   const normalizedSearch = search.toLowerCase();
   return items.filter((item) => item.keyword.toLowerCase().includes(normalizedSearch));
};

export const filterByDevice = <T extends { device: string }>(items: T[], device: string): {[key: string]: T[] } => {
   const deviceKeywords: {[key:string] : T[]} = { desktop: [], mobile: [] };
   items.forEach((keyword) => {
      if (keyword.device === device) { deviceKeywords[device].push(keyword); }
   });
   return deviceKeywords;
};

const sortByPositionWithFallback = <T extends { position: number }>(items: T[], direction: SortDirection): T[] => {
   const keywordsWithFallback = items.map((item) => ({ ...item, position: item.position === 0 ? 111 : item.position }));
   const sortedItems = sortByNumericField(keywordsWithFallback, (item) => item.position, direction);
   return sortedItems.map((item) => ({ ...item, position: item.position === 111 ? 0 : item.position }));
};

/**
 * Sort Keywords by user's given input.
 * @param {KeywordType[]} theKeywords - The Keywords to sort.
 * @param {string} sortBy - The sort method.
 * @returns {KeywordType[]}
 */
export const sortKeywords = (theKeywords:KeywordType[], sortBy:string, scDataType?: string) : KeywordType[] => {
   const baseKeywords = [...theKeywords];
   let sortedItems: KeywordType[] = [];
   switch (sortBy) {
      case 'date_asc':
            sortedItems = sortByNumericField(baseKeywords, (item) => new Date(item.added).getTime(), 'asc');
            break;
      case 'date_desc':
            sortedItems = sortByNumericField(baseKeywords, (item) => new Date(item.added).getTime(), 'desc');
            break;
      case 'pos_asc':
            sortedItems = sortByPositionWithFallback(baseKeywords, 'asc');
            break;
      case 'pos_desc':
            sortedItems = sortByPositionWithFallback(baseKeywords, 'desc');
            break;
      case 'alpha_asc':
            sortedItems = sortByStringField(baseKeywords, (item) => item.keyword, 'asc');
            break;
      case 'alpha_desc':
            sortedItems = sortByStringField(baseKeywords, (item) => item.keyword, 'desc');
         break;
      case 'vol_asc':
            sortedItems = sortByNumericField(baseKeywords, (item) => item.volume, 'asc');
            break;
      case 'vol_desc':
            sortedItems = sortByNumericField(baseKeywords, (item) => item.volume, 'desc');
            break;
      case 'imp_desc':
            if (scDataType) {
               sortedItems = sortByNumericField(
                  baseKeywords,
                  (item) => item.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0,
                  'desc'
               );
            }
            break;
      case 'imp_asc':
            if (scDataType) {
               sortedItems = sortByNumericField(
                  baseKeywords,
                  (item) => item.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0,
                  'asc'
               );
            }
         break;
      case 'visits_desc':
            if (scDataType) {
               sortedItems = sortByNumericField(
                  baseKeywords,
                  (item) => item.scData?.visits[scDataType as keyof KeywordSCDataChild] || 0,
                  'desc'
               );
            }
            break;
      case 'visits_asc':
            if (scDataType) {
               sortedItems = sortByNumericField(
                  baseKeywords,
                  (item) => item.scData?.visits[scDataType as keyof KeywordSCDataChild] || 0,
                  'asc'
               );
            }
            break;
      default:
            return theKeywords;
   }

   // Stick Favorites item to top
   sortedItems = [...sortedItems].sort((a: KeywordType, b: KeywordType) => {
      const aSticky = Boolean(a.sticky);
      const bSticky = Boolean(b.sticky);
      return aSticky === bSticky ? 0 : (bSticky ? 1 : -1);
   });

   return sortedItems;
};

/**
 * Filters the Keywords by Device when the Device buttons are switched
 * @param {KeywordType[]} sortedKeywords - The Sorted Keywords.
 * @param {string} device - Device name (desktop or mobile).
 * @returns {{desktop: KeywordType[], mobile: KeywordType[] } }
 */
export const keywordsByDevice = (sortedKeywords: KeywordType[], device: string): {[key: string]: KeywordType[] } => (
   filterByDevice(sortedKeywords, device)
);

export const matchesCountry = (keywordCountry: string, countries: string[]): boolean => (
   countries.length === 0 || countries.includes(keywordCountry)
);

export const matchesSearch = (keyword: string, search: string): boolean => {
   if (!search) { return true; }
   const normalizedKeyword = keyword.toLowerCase();
   const normalizedSearch = search.toLowerCase();
   return normalizedKeyword.includes(normalizedSearch);
};

export const matchesTags = (keywordTags: string[], tags: string[]): boolean => (
   tags.length === 0 || tags.some((tag) => keywordTags.includes(tag))
);

/**
 * Filters the keywords by country, search string or tags.
 * @param {KeywordType[]} keywords - The keywords.
 * @param {KeywordFilters} filterParams - The user Selected filter object.
 * @returns {KeywordType[]}
 */
export const filterKeywords = (keywords: KeywordType[], filterParams: KeywordFilters):KeywordType[] => (
   filterBySearch(
      filterByCountry(keywords, filterParams.countries),
      filterParams.search
   ).filter((keyword) => matchesTags(keyword.tags, filterParams.tags))
);

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
 * Filters the Keywords by Device when the Device buttons are switched
 * @param {SCKeywordType[]} sortedKeywords - The Sorted Keywords.
 * @param {string} device - Device name (desktop or mobile).
 * @returns {{desktop: SCKeywordType[], mobile: SCKeywordType[] } }
 */
export const SCkeywordsByDevice = (sortedKeywords: SCKeywordType[], device: string): {[key: string]: SCKeywordType[] } => (
   filterByDevice(sortedKeywords, device)
);

/**
 * Filters the keywords by country, search string or tags.
 * @param {SCKeywordType[]} keywords - The keywords.
 * @param {KeywordFilters} filterParams - The user Selected filter object.
 * @returns {SCKeywordType[]}
 */
export const SCfilterKeywords = (keywords: SCKeywordType[], filterParams: KeywordFilters):SCKeywordType[] => {
   const countryFiltered = filterByCountry(keywords, filterParams.countries);
   return filterBySearch(countryFiltered, filterParams.search, { caseSensitive: true });
};

export const IdeasSortKeywords = (theKeywords: IdeaKeyword[], sortBy: string): IdeaKeyword[] => {
   const keywordsToSort = [...theKeywords];

   switch (sortBy) {
      case 'vol_asc':
         return keywordsToSort.sort((a: IdeaKeyword, b: IdeaKeyword) => (a.avgMonthlySearches ?? 0) - (b.avgMonthlySearches ?? 0));
      case 'vol_desc':
         return keywordsToSort.sort((a: IdeaKeyword, b: IdeaKeyword) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0));
      case 'competition_asc':
         return keywordsToSort.sort((a: IdeaKeyword, b: IdeaKeyword) => (a.competitionIndex ?? 0) - (b.competitionIndex ?? 0));
      case 'competition_desc':
         return keywordsToSort.sort((a: IdeaKeyword, b: IdeaKeyword) => (b.competitionIndex ?? 0) - (a.competitionIndex ?? 0));
      default:
         return [...theKeywords];
   }
};

export const matchesIdeaCountry = (country: string, countries: string[]): boolean => (
   countries.length === 0 || countries.includes(country)
);

export const matchesIdeaSearch = (keyword: string, search: string): boolean => matchesSearch(keyword, search);

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

export const IdeasfilterKeywords = (keywords: IdeaKeyword[], filterParams: KeywordFilters): IdeaKeyword[] => (
   keywords.filter((keywrd) => (
      matchesIdeaCountry(keywrd.country, filterParams.countries)
      && matchesIdeaSearch(keywrd.keyword, filterParams.search)
      && matchesIdeaTags(keywrd.keyword, filterParams.tags)
   ))
);
