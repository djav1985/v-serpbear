import dayjs from 'dayjs';
import { readFile } from 'fs/promises';
import path from 'path';
import { getKeywordsInsight, getPagesInsight } from './insight';
import { fetchDomainSCData, getSearchConsoleApiInfo, isSearchConsoleDataFreshForToday, readLocalSCData } from './searchConsole';

const serpBearLogo = 'https://serpbear.b-cdn.net/ikAdjQq.png';
const mobileIcon = 'https://serpbear.b-cdn.net/SqXD9rd.png';
const desktopIcon = 'https://serpbear.b-cdn.net/Dx3u0XD.png';
const googleIcon = 'https://serpbear.b-cdn.net/Sx3u0X9.png';

type SCStatsObject = {
   [key:string]: {
      html: string,
      label: string,
      clicks?: number,
      impressions?: number
   },
}

/**
 * Generate Human readable Time string.
 * @param {number} date - Keywords to scrape
 * @returns {string}
 */
const timeSince = (date:number) : string => {
   const seconds = Math.floor(((new Date().getTime() / 1000) - date));
   let interval = Math.floor(seconds / 31536000);

   if (interval > 1) return `${interval} years ago`;

   interval = Math.floor(seconds / 2592000);
   if (interval > 1) return `${interval} months ago`;

   interval = Math.floor(seconds / 86400);
   if (interval >= 1) return `${interval} days ago`;

   interval = Math.floor(seconds / 3600);
   if (interval >= 1) return `${interval} hrs ago`;

   interval = Math.floor(seconds / 60);
   if (interval > 1) return `${interval} mins ago`;

   return `${Math.floor(seconds)} secs ago`;
};

/**
 * Returns a Keyword's position change value by comparing the current position with previous position.
 * @param {KeywordHistory} history - Keywords to scrape
 * @param {number} position - Keywords to scrape
 * @returns {number}
 */
const getPositionChange = (history:KeywordHistory, position:number) : number => {
   let status = 0;
   if (Object.keys(history).length >= 2) {
      const historyArray = Object.keys(history).map((dateKey) => ({
               date: new Date(dateKey).getTime(),
               dateRaw: dateKey,
               position: history[dateKey],
            }));
      const historySorted = historyArray.sort((a, b) => a.date - b.date);
      const previousPos = historySorted[historySorted.length - 2].position;
      status = previousPos === 0 ? position : previousPos - position;
      if (position === 0 && previousPos > 0) {
         status = previousPos - 100;
      }
   }
   return status;
};

const getBestKeywordPosition = (history: KeywordHistory) => {
   let bestPos;
   if (Object.keys(history).length > 0) {
      const historyArray = Object.keys(history).map((itemID) => ({ date: itemID, position: history[itemID] }))
          .sort((a, b) => a.position - b.position).filter((el) => (el.position > 0));
      if (historyArray[0]) {
         bestPos = { ...historyArray[0] };
      }
   }

   return bestPos?.position || '-';
};

/**
 * Generate the Email HTML based on given domain name and its keywords
 * @param {string} domainName - Keywords to scrape
 * @param {keywords[]} keywords - Keywords to scrape
 * @returns {Promise}
 */
const generateEmail = async (domain:DomainType, keywords:KeywordType[], settings: SettingsType) : Promise<string> => {
   const domainName = domain.domain;
   const emailTemplate = await readFile(path.join(__dirname, '..', '..', '..', '..', 'email', 'email.html'), { encoding: 'utf-8' });
   const currentDate = dayjs(new Date()).format('MMMM D, YYYY');
   const keywordsCount = keywords.length;
   let improved = 0; let declined = 0;

   let keywordsTable = '';

   keywords.forEach((keyword) => {
      let positionChangeIcon = '';

      const positionChange = getPositionChange(keyword.history, keyword.position);
      const deviceIconImg = keyword.device === 'desktop' ? desktopIcon : mobileIcon;
      const countryFlag = `<img class="flag" src="https://flagcdn.com/w20/${keyword.country.toLowerCase()}.png" alt="${keyword.country}" title="${keyword.country}" />`;
      const deviceIcon = `<img class="device" src="${deviceIconImg}" alt="${keyword.device}" title="${keyword.device}" width="18" height="18" />`;

      if (positionChange > 0) { positionChangeIcon = '<span style="color:#5ed7c3;">▲</span>'; improved += 1; }
      if (positionChange < 0) { positionChangeIcon = '<span style="color:#fca5a5;">▼</span>'; declined += 1; }

      const posChangeIcon = positionChange ? `<span class="pos_change">${positionChangeIcon} ${positionChange}</span>` : '';
      keywordsTable += `<tr class="keyword">
                           <td>${countryFlag} ${deviceIcon} ${keyword.keyword}</td>
                           <td>${keyword.city || keyword.state ? `(${[keyword.city, keyword.state].filter(Boolean).join(', ')})` : ''}</td>
                           <td>${keyword.position}${posChangeIcon}</td>
                           <td>${getBestKeywordPosition(keyword.history)}</td>
                           <td>${timeSince(new Date(keyword.lastUpdated).getTime() / 1000)}</td>
                        </tr>`;
   });

   const stat = `${improved > 0 ? `${improved} Improved` : ''} 
                  ${improved > 0 && declined > 0 ? ', ' : ''} ${declined > 0 ? `${declined} Declined` : ''}`;
   const updatedEmail = emailTemplate
         .replace('{{logo}}', `<img class="logo_img" src="${serpBearLogo}" alt="SerpBear" width="24" height="24" />`)
         .replace('{{currentDate}}', currentDate)
         .replace('{{domainName}}', domainName)
         .replace('{{keywordsCount}}', keywordsCount.toString())
         .replace('{{keywordsTable}}', keywordsTable)
         .replace('{{appURL}}', process.env.NEXT_PUBLIC_APP_URL || '')
         .replace('{{stat}}', stat)
         .replace('{{preheader}}', stat);

      const isConsoleIntegrated = !!(process.env.SEARCH_CONSOLE_PRIVATE_KEY && process.env.SEARCH_CONSOLE_CLIENT_EMAIL)
      || (settings.search_console_client_email && settings.search_console_private_key);
      const htmlWithSCStats = isConsoleIntegrated ? await generateGoogleConsoleStats(domain) : '';
      const emailHTML = updatedEmail.replace('{{SCStatsTable}}', htmlWithSCStats);

      // await writeFile('testemail.html', emailHTML, { encoding: 'utf-8' });

   return emailHTML;
};

/**
 * Helper function to check if search console data needs refreshing
 */
const needsRefresh = (localSCData: SCDomainDataType | null): boolean => {
   const cronTimezone = process.env.CRON_TIMEZONE || 'America/New_York';
   const hasStats = !!(localSCData?.stats && localSCData.stats.length);
   const lastFetched = localSCData?.lastFetched;
   return !(hasStats && isSearchConsoleDataFreshForToday(lastFetched, cronTimezone));
};

/**
 * Helper function to fetch fresh search console data
 */
const fetchFreshSCData = async (domain: DomainType): Promise<SCDomainDataType | null> => {
   const scDomainAPI = domain.search_console ? await getSearchConsoleApiInfo(domain) : { client_email: '', private_key: '' };
   const scGlobalAPI = await getSearchConsoleApiInfo({} as DomainType);
   
   if (scDomainAPI.client_email || scGlobalAPI.client_email) {
      const refreshed = await fetchDomainSCData(domain, scDomainAPI, scGlobalAPI);
      if (refreshed && refreshed.stats && refreshed.stats.length) {
         return refreshed;
      }
   }
   
   return null;
};

/**
 * Helper function to get or refresh search console data for a domain
 */
const getOrRefreshSCData = async (domain: DomainType): Promise<SCDomainDataType | null> => {
   const initialSCData = await readLocalSCData(domain.domain);
   let localSCData: SCDomainDataType | null = initialSCData === false ? null : initialSCData;
   
   if (!localSCData || needsRefresh(localSCData)) {
      const freshData = await fetchFreshSCData(domain);
      if (freshData) {
         localSCData = freshData;
      }
   }
   
   return localSCData;
};

/**
 * Helper function to generate HTML table columns for search console data
 */
const generateSCColumn = (item: SCInsightItem, firstColumKey: string): string => {
   return `<tr class="keyword">
            <td>${item[firstColumKey as keyof SCInsightItem]}</td>
            <td>${item.clicks}</td>
            <td>${item.impressions}</td>
            <td>${Math.round(item.position)}</td>
         </tr>`;
};

/**
 * Helper function to build search console data structure with HTML content
 */
const buildSCDataStructure = (localSCData: SCDomainDataType): SCStatsObject => {
   const scData: SCStatsObject = {
      stats: { html: '', label: 'Performance for Last 7 Days', clicks: 0, impressions: 0 },
      keywords: { html: '', label: 'Top 5 Keywords' },
      pages: { html: '', label: 'Top 5 Pages' },
   };
   
   const stats = Array.isArray(localSCData.stats) ? localSCData.stats : [];
   const SCStats = [...stats].reverse().slice(0, 7);
   const keywords = getKeywordsInsight(localSCData, 'clicks', 'sevenDays');
   const pages = getPagesInsight(localSCData, 'clicks', 'sevenDays');
   
   if (SCStats.length > 0) {
      scData.stats.html = SCStats.reduce((acc, item) => acc + generateSCColumn(item, 'date'), '');
   }
   if (keywords.length > 0) {
      scData.keywords.html = keywords.slice(0, 5).reduce((acc, item) => acc + generateSCColumn(item, 'keyword'), '');
   }
   if (pages.length > 0) {
      scData.pages.html = pages.slice(0, 5).reduce((acc, item) => acc + generateSCColumn(item, 'page'), '');
   }
   
   scData.stats.clicks = SCStats.reduce((acc, item) => acc + item.clicks, 0);
   scData.stats.impressions = SCStats.reduce((acc, item) => acc + item.impressions, 0);
   
   return scData;
};

/**
 * Helper function to generate the search console header HTML
 */
const generateSCHeader = (localSCData: SCDomainDataType): string => {
   const stats = Array.isArray(localSCData.stats) ? localSCData.stats : [];
   const SCStats = [...stats].reverse().slice(0, 7);
   const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
   
   let dateRangeText = '';
   if (SCStats.length > 0) {
      const endDate = new Date(SCStats[0].date);
      const startDate = new Date(SCStats[SCStats.length - 1].date);
      dateRangeText = `${startDate.getDate()} ${months[startDate.getMonth()]} -  ${endDate.getDate()} ${months[endDate.getMonth()]} (Last 7 Days)`;
   }
   
   return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" class="console_table">
              <tr>
                 <td style="font-weight:bold;">
                 <img class="google_icon" src="${googleIcon}" alt="Google" width="13" height="13"> Google Search Console Stats</h3>
                 </td>
                 <td class="stat" align="right" style="font-size: 12px;">
                 ${dateRangeText}
                 </td>
              </tr>
           </table>`;
};

/**
 * Helper function to generate the search console data tables HTML
 */
const generateSCDataTables = (scData: SCStatsObject): string => {
   let htmlWithSCStats = '';
   
   Object.keys(scData).forEach((itemKey) => {
      const scItem = scData[itemKey as keyof SCStatsObject];
      const scItemFirstColName = itemKey === 'stats' ? 'Date' : `${itemKey[0].toUpperCase()}${itemKey.slice(1)}`;
      
      htmlWithSCStats += `<table role="presentation" border="0" cellpadding="0" cellspacing="0" class="subhead">
                              <tr>
                                 <td style="font-weight:bold;">${scItem.label}</h3></td>
                                 ${scItem.clicks && scItem.impressions ? (
                                    `<td class="stat" align="right">
                                       <strong>${scItem.clicks}</strong> Clicks | <strong>${scItem.impressions}</strong> Views
                                    </td>`
                                    )
                                    : ''
                                 }
                              </tr>
                           </table>
                           <table role="presentation" class="main" style="margin-bottom:20px">
                              <tbody>
                                 <tr>
                                    <td class="wrapper">
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="keyword_table keyword_table--sc">
                                       <tbody>
                                          <tr align="left">
                                             <th>${scItemFirstColName}</th>
                                             <th>Clicks</th>
                                             <th>Views</th>
                                             <th>Position</th>
                                          </tr>
                                          ${scItem.html}
                                       </tbody>
                                    </table>
                                    </td>
                                 </tr>
                              </tbody>
                           </table>`;
   });
   
   return htmlWithSCStats;
};

/**
 * Generate the Email HTML for Google Search Console Data.
 * @param {DomainType} domain - The Domain for which to generate the HTML.
 * @returns {Promise<string>}
 */
export const generateGoogleConsoleStats = async (domain: DomainType): Promise<string> => {
   if (!domain?.domain) return '';

   const localSCData = await getOrRefreshSCData(domain);
   if (!localSCData || !localSCData.stats || !localSCData.stats.length) {
      return '';
   }

   const scData = buildSCDataStructure(localSCData);
   const headerHtml = generateSCHeader(localSCData);
   const dataTablesHtml = generateSCDataTables(scData);
   
   return headerHtml + dataTablesHtml;
};

export default generateEmail;
