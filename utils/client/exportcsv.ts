import countries from '../countries';

const getCountryLabel = (countryCode?: string) => {
   if (!countryCode) { return 'Unknown'; }
   const countryData = countries[countryCode];
   if (countryData && countryData[0]) { return countryData[0]; }
   return countryCode || 'Unknown';
};

const escapeCsvValue = (value: unknown): string => {
   if (value === null || value === undefined) {
      return '""';
   }
   let stringValue = String(value);
   // Spreadsheet apps run text starting with = + - @ as a formula. Keyword text comes from search
   // queries, so prefix such values with an apostrophe to keep them as plain text.
   // A lone "-" is the empty-position placeholder, not a formula, so it is left alone.
   if (typeof value === 'string' && stringValue.length > 1 && /^[=+\-@]/.test(stringValue)) {
      stringValue = `'${stringValue}`;
   }
   return `"${stringValue.replace(/"/g, '""')}"`;
};

const buildCsvRow = (values: unknown[]): string => `${values.map(escapeCsvValue).join(',')}\r\n`;

type CsvPayload = {
   header: string,
   body: string,
   fileName: string,
};

export const createKeywordCsvPayload = (
   keywords: KeywordType[] | SCKeywordType[],
   domain: string,
   scDataDuration = 'lastThreeDays',
): CsvPayload | null => {
   if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) { return null; }

   const isSCKeywords = !!(keywords && keywords[0] && (keywords[0] as SCKeywordType).uid);
   let csvHeader = 'ID,Keyword,Position,URL,Country,State,City,Device,Updated,Added,Tags\r\n';
   let csvBody = '';
   let fileName = `${domain}-keywords_serp.csv`;

   if (isSCKeywords) {
      csvHeader = 'ID,Keyword,Position,Impressions,Clicks,CTR,Country,Device\r\n';
      fileName = `${domain}-search-console-${scDataDuration}.csv`;
      csvBody = (keywords as SCKeywordType[]).map((keywordData, index) => buildCsvRow([
         index,
         keywordData.keyword,
         keywordData.position === 0 ? '-' : keywordData.position,
         keywordData.impressions,
         keywordData.clicks,
         keywordData.ctr,
         getCountryLabel(keywordData.country),
         keywordData.device,
      ])).join('');
   } else {
      csvBody = (keywords as KeywordType[]).map((keywordData) => buildCsvRow([
         keywordData.ID,
         keywordData.keyword,
         keywordData.position === 0 ? '-' : keywordData.position,
         keywordData.url || '-',
         getCountryLabel(keywordData.country),
         keywordData.state || '-',
         keywordData.city || '-',
         keywordData.device,
         keywordData.lastUpdated,
         keywordData.added,
         Array.isArray(keywordData.tags) ? keywordData.tags.join(',') : '',
      ])).join('');
   }

   return { header: csvHeader, body: csvBody, fileName };
};

  /**
   * Generates CSV File form the given domain & keywords, and automatically downloads it.
   * @param {KeywordType[]}  keywords - The keywords of the domain
   * @param {string} domain - The domain name.
   * @returns {void}
   */
const exportCSV = (keywords: KeywordType[] | SCKeywordType[], domain:string, scDataDuration = 'lastThreeDays') => {
   const payload = createKeywordCsvPayload(keywords, domain, scDataDuration);
   if (!payload) { return; }

   downloadCSV(payload.header, payload.body, payload.fileName);
};

/**
* Generates CSV File form the given keyword Ideas, and automatically downloads it.
* @param {IdeaKeyword[]}  keywords - The keyword Ideas to export
* @param {string} domainName - The domain name.
* @returns {void}
*/
export const createKeywordIdeasCsvPayload = (keywords: IdeaKeyword[], domainName:string): CsvPayload | null => {
   if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) { return null; }

   const csvHeader = 'Keyword,Volume,Competition,CompetitionScore,Country,Added\r\n';
   const fileName = `${domainName}-keyword_ideas.csv`;
   const csvBody = keywords.map((keywordData) => {
      const { keyword, competition, country, competitionIndex, avgMonthlySearches, added } = keywordData;
      const addedDate = new Intl.DateTimeFormat('en-US').format(new Date(added));
      return formatKeywordIdeaRow({
         keyword,
         competition,
         country,
         competitionIndex,
         avgMonthlySearches,
         addedDate,
      });
   }).join('');

   return { header: csvHeader, body: csvBody, fileName };
};

export const exportKeywordIdeas = (keywords: IdeaKeyword[], domainName:string) => {
   const payload = createKeywordIdeasCsvPayload(keywords, domainName);
   if (!payload) { return; }

   downloadCSV(payload.header, payload.body, payload.fileName);
};

export const formatKeywordIdeaRow = ({
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
}) => buildCsvRow([
   keyword,
   avgMonthlySearches,
   competition,
   competitionIndex,
   getCountryLabel(country),
   addedDate,
]);

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
