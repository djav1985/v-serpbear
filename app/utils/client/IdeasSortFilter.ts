/**
 * Sort Keyword Ideas by user's given input.
 * @param {IdeaKeyword[]} theKeywords - The Keywords to sort.
 * @param {string} sortBy - The sort method.
 * @returns {IdeaKeyword[]}
 */

export const IdeasSortKeywords = (theKeywords:IdeaKeyword[], sortBy:string) : IdeaKeyword[] => {
   let sortedItems = [];
   switch (sortBy) {
      case 'vol_asc':
            sortedItems = theKeywords.sort((a: IdeaKeyword, b: IdeaKeyword) => (a.avgMonthlySearches ?? 0) - (b.avgMonthlySearches ?? 0));
            break;
      case 'vol_desc':
            sortedItems = theKeywords.sort((a: IdeaKeyword, b: IdeaKeyword) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0));
            break;
      case 'competition_asc':
            sortedItems = theKeywords.sort((a: IdeaKeyword, b: IdeaKeyword) => (a.competitionIndex ?? 0) - (b.competitionIndex ?? 0));
            break;
      case 'competition_desc':
            sortedItems = theKeywords.sort((a: IdeaKeyword, b: IdeaKeyword) => (b.competitionIndex ?? 0) - (a.competitionIndex ?? 0));
            break;
      default:
            return theKeywords;
   }

   return sortedItems;
};

/**
 * Filters the keyword Ideas by country, search string or tags.
 * @param {IdeaKeyword[]} keywords - The keywords.
 * @param {KeywordFilters} filterParams - The user Selected filter object.
 * @returns {IdeaKeyword[]}
 */

export const matchesIdeaCountry = (country: string, countries: string[]): boolean => (
   countries.length === 0 || countries.includes(country)
);

export const matchesIdeaSearch = (keyword: string, search: string): boolean => {
   if (!search) { return true; }
   const normalizedKeyword = keyword.toLowerCase();
   const normalizedSearch = search.toLowerCase();
   return normalizedKeyword.includes(normalizedSearch);
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

export const IdeasfilterKeywords = (keywords: IdeaKeyword[], filterParams: KeywordFilters):IdeaKeyword[] => (
   keywords.filter((keywrd) => (
      matchesIdeaCountry(keywrd.country, filterParams.countries)
      && matchesIdeaSearch(keywrd.keyword, filterParams.search)
      && matchesIdeaTags(keywrd.keyword, filterParams.tags)
   ))
);
