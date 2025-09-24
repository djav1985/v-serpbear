/**
 * Sort Keywords by user's given input.
 * @param {KeywordType[]} theKeywords - The Keywords to sort.
 * @param {string} sortBy - The sort method.
 * @returns {KeywordType[]}
 */
export const sortKeywords = (theKeywords:KeywordType[], sortBy:string, scDataType?: string) : KeywordType[] => {
   let sortedItems: KeywordType[] = [];
   const keywords = theKeywords.map((k) => ({ ...k, position: k.position === 0 ? 111 : k.position }));
   switch (sortBy) {
      case 'date_asc':
            sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => new Date(b.added).getTime() - new Date(a.added).getTime());
            break;
      case 'date_desc':
            sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => new Date(a.added).getTime() - new Date(b.added).getTime());
            break;
      case 'pos_asc':
            sortedItems = keywords.sort((a: KeywordType, b: KeywordType) => (b.position > a.position ? 1 : -1));
            sortedItems = sortedItems.map((k) => ({ ...k, position: k.position === 111 ? 0 : k.position }));
            break;
      case 'pos_desc':
            sortedItems = keywords.sort((a: KeywordType, b: KeywordType) => (a.position > b.position ? 1 : -1));
            sortedItems = sortedItems.map((k) => ({ ...k, position: k.position === 111 ? 0 : k.position }));
            break;
      case 'alpha_asc':
            sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => (b.keyword > a.keyword ? 1 : -1));
            break;
      case 'alpha_desc':
            sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => (a.keyword > b.keyword ? 1 : -1));
         break;
      case 'vol_asc':
            sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => (b.volume - a.volume));
            break;
      case 'vol_desc':
            sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => (a.volume - b.volume));
            break;
      case 'imp_desc':
            if (scDataType) {
                  sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => {
                  const bImpressionData = b.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0;
                  const aImpressionData = a.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0;
                  return bImpressionData - aImpressionData;
               });
            }
            break;
      case 'imp_asc':
            if (scDataType) {
                  sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => {
                  const bImpressionData = b.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0;
                  const aImpressionData = a.scData?.impressions[scDataType as keyof KeywordSCDataChild] || 0;
                  return aImpressionData - bImpressionData;
               });
            }
         break;
      case 'visits_desc':
            if (scDataType) {
                  sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => {
                  const bVisitsData = b.scData?.visits[scDataType as keyof KeywordSCDataChild] || 0;
                  const aVisitsData = a.scData?.visits[scDataType as keyof KeywordSCDataChild] || 0;
                  return bVisitsData - aVisitsData;
               });
            }
            break;
      case 'visits_asc':
            if (scDataType) {
                  sortedItems = theKeywords.sort((a: KeywordType, b: KeywordType) => {
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
   sortedItems = sortedItems.sort((a: KeywordType, b: KeywordType) => (b.sticky > a.sticky ? 1 : -1));

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
