/**
 * Sort Keywords by user's given input.
 * @param {KeywordType[]} theKeywords - The Keywords to sort.
 * @param {string} sortBy - The sort method.
 * @returns {KeywordType[]}
 */
export const sortKeywords = (theKeywords:KeywordType[], sortBy:string, scDataType?: string) : KeywordType[] => {
   const keywordsWithFallback = theKeywords.map((k) => ({ ...k, position: k.position === 0 ? 111 : k.position }));
   const baseKeywords = [...theKeywords];
   let sortedItems: KeywordType[] = [];
   switch (sortBy) {
      case 'date_asc':
            sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => new Date(a.added).getTime() - new Date(b.added).getTime());
            break;
      case 'date_desc':
            sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => new Date(b.added).getTime() - new Date(a.added).getTime());
            break;
      case 'pos_asc':
            sortedItems = keywordsWithFallback
               .slice()
               .sort((a: KeywordType, b: KeywordType) => (a.position > b.position ? 1 : (a.position < b.position ? -1 : 0)));
            sortedItems = sortedItems.map((k) => ({ ...k, position: k.position === 111 ? 0 : k.position }));
            break;
      case 'pos_desc':
            sortedItems = keywordsWithFallback
               .slice()
               .sort((a: KeywordType, b: KeywordType) => (b.position > a.position ? 1 : (b.position < a.position ? -1 : 0)));
            sortedItems = sortedItems.map((k) => ({ ...k, position: k.position === 111 ? 0 : k.position }));
            break;
      case 'alpha_asc':
            sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => a.keyword.localeCompare(b.keyword));
            break;
      case 'alpha_desc':
            sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => b.keyword.localeCompare(a.keyword));
         break;
      case 'vol_asc':
            sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => (a.volume - b.volume));
            break;
      case 'vol_desc':
            sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => (b.volume - a.volume));
            break;
      case 'imp_desc':
            if (scDataType) {
                  sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => {
                  const bImpressionData = b.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0;
                  const aImpressionData = a.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0;
                  return bImpressionData - aImpressionData;
               });
            }
            break;
      case 'imp_asc':
            if (scDataType) {
                  sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => {
                  const bImpressionData = b.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0;
                  const aImpressionData = a.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0;
                  return aImpressionData - bImpressionData;
               });
            }
         break;
      case 'visits_desc':
            if (scDataType) {
                  sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => {
                  const bVisitsData = b.scData?.visits[scDataType as keyof KeywordSCDataChild] || 0;
                  const aVisitsData = a.scData?.visits[scDataType as keyof KeywordSCDataChild] || 0;
                  return bVisitsData - aVisitsData;
               });
            }
            break;
      case 'visits_asc':
            if (scDataType) {
                  sortedItems = baseKeywords.sort((a: KeywordType, b: KeywordType) => {
                  const bVisitsData = b.scData?.visits[scDataType as keyof KeywordSCDataChild] || 0;
                  const aVisitsData = a.scData?.visits[scDataType as keyof KeywordSCDataChild] || 0;
                  return aVisitsData - bVisitsData;
               });
            }
            break;
      default:
            return theKeywords;
   }

   // Stick Favorites item to top
   sortedItems = [...sortedItems].sort((a: KeywordType, b: KeywordType) => (b.sticky === a.sticky ? 0 : (b.sticky ? 1 : -1)));

   return sortedItems;
};

/**
 * Filters the Keywords by Device when the Device buttons are switched
 * @param {KeywordType[]} sortedKeywords - The Sorted Keywords.
 * @param {string} device - Device name (desktop or mobile).
 * @returns {{desktop: KeywordType[], mobile: KeywordType[] } }
 */
export const keywordsByDevice = (sortedKeywords: KeywordType[], device: string): {[key: string]: KeywordType[] } => {
   const deviceKeywords: {[key:string] : KeywordType[]} = { desktop: [], mobile: [] };
   sortedKeywords.forEach((keyword) => {
      if (keyword.device === device) { deviceKeywords[device].push(keyword); }
   });
   return deviceKeywords;
};

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
   keywords.filter((keyword) => (
      matchesCountry(keyword.country, filterParams.countries)
      && matchesSearch(keyword.keyword, filterParams.search)
      && matchesTags(keyword.tags, filterParams.tags)
   ))
);

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
