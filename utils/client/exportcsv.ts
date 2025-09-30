import countries from '../countries';

const getCountryLabel = (countryCode?: string) => {
   if (!countryCode) { return 'Unknown'; }
   const countryData = countries[countryCode];
   if (countryData && countryData[0]) { return countryData[0]; }
   return countryCode || 'Unknown';
};

  /**
   * Generates CSV File form the given domain & keywords, and automatically downloads it.
   * @param {KeywordType[]}  keywords - The keywords of the domain
   * @param {string} domain - The domain name.
   * @returns {void}
   */
const exportCSV = (keywords: KeywordType[] | SCKeywordType[], domain:string, scDataDuration = 'lastThreeDays') => {
   if (!keywords || (keywords && Array.isArray(keywords) && keywords.length === 0)) { return; }
   const isSCKeywords = !!(keywords && keywords[0] && keywords[0].uid);
   let csvHeader = 'ID,Keyword,Position,URL,Country,State,City,Device,Updated,Added,Tags\r\n';
   let csvBody = '';
   let fileName = `${domain}-keywords_serp.csv`;

   if (isSCKeywords) {
      csvHeader = 'ID,Keyword,Position,Impressions,Clicks,CTR,Country,Device\r\n';
      fileName = `${domain}-search-console-${scDataDuration}.csv`;
      keywords.forEach((keywordData, index) => {
         const { keyword, position, country, device, clicks, impressions, ctr } = keywordData as SCKeywordType;
         const row = [
            index,
            keyword,
            position === 0 ? '-' : position,
            impressions,
            clicks,
            ctr,
            getCountryLabel(country),
            device,
         ].join(', ');
         csvBody += `${row}\r\n`;
      });
   } else {
      keywords.forEach((keywordData) => {
         const { ID, keyword, position, url, country, state, city, device, lastUpdated, added, tags } = keywordData as KeywordType;
         const row = [
            ID,
            keyword,
            position === 0 ? '-' : position,
            url || '-',
            getCountryLabel(country),
            state || '-',
            city || '-',
            device,
            lastUpdated,
            added,
            tags.join(','),
         ].join(', ');
         csvBody += `${row}\r\n`;
      });
   }

   downloadCSV(csvHeader, csvBody, fileName);
};

/**
* Generates CSV File form the given keyword Ideas, and automatically downloads it.
* @param {IdeaKeyword[]}  keywords - The keyword Ideas to export
* @param {string} domainName - The domain name.
* @returns {void}
*/
export const exportKeywordIdeas = (keywords: IdeaKeyword[], domainName:string) => {
   if (!keywords || (keywords && Array.isArray(keywords) && keywords.length === 0)) { return; }
   const csvHeader = 'Keyword,Volume,Competition,CompetitionScore,Country,Added\r\n';
   let csvBody = '';
   const fileName = `${domainName}-keyword_ideas.csv`;
   keywords.forEach((keywordData) => {
      const { keyword, competition, country, competitionIndex, avgMonthlySearches, added } = keywordData;
      const addedDate = new Intl.DateTimeFormat('en-US').format(new Date(added));
      csvBody += formatKeywordIdeaRow({
         keyword,
         competition,
         country,
         competitionIndex,
         avgMonthlySearches,
         addedDate,
      });
   });
   downloadCSV(csvHeader, csvBody, fileName);
};

const formatKeywordIdeaRow = ({
   keyword,
   competition,
   country,
   competitionIndex,
   avgMonthlySearches,
   addedDate,
}:{
   keyword: string,
   competition: IdeaKeyword['competition'],
   country: string,
   competitionIndex: number,
   avgMonthlySearches: number,
   addedDate: string,
}) => `${keyword}, ${avgMonthlySearches}, ${competition}, ${competitionIndex}, ${getCountryLabel(country)}, ${addedDate}\r\n`;

/**
 * generates a CSV file with a specified header and body content and automatically downloads it.
 * @param {string} csvHeader - The `csvHeader` file header. A comma speperated csv header.
 * @param {string} csvBody - The content of the csv file.
 * @param {string} fileName - The file Name for the downlaoded csv file.
 */
const downloadCSV = (csvHeader:string, csvBody:string, fileName:string) => {
   const blob = new Blob([csvHeader + csvBody], { type: 'text/csv;charset=utf-8;' });
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.setAttribute('href', url);
   link.setAttribute('download', fileName);
   link.style.visibility = 'hidden';
   document.body.appendChild(link);
   link.click();
   document.body.removeChild(link);
};

export default exportCSV;
