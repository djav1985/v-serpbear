import { readFile } from 'fs/promises';
import path from 'path';
import { getKeywordsInsight, getPagesInsight } from './insight';
import { fetchDomainSCData, getSearchConsoleApiInfo, isSearchConsoleDataFreshForToday, readLocalSCData } from './searchConsole';
import { parseLocation } from './location';
import { buildLogoUrl, getBranding } from './branding';
import { ensureBrandingAssets } from './brandingAssets';
import { normalizeToBoolean } from './dbBooleans';
import { historyKeyToTime } from './historyDateKey';
import { APP_TIMEZONE, dateKeyToTime, formatDateKey, todayKey } from './timezone';
import { formatAveragePosition, getUnrankedPenalty, summarizeAveragePosition } from './averagePosition';

const DEFAULT_BRAND_LOGO = 'https://serpbear.b-cdn.net/ikAdjQq.png';
// Blue phone icon (blue-700, the app's position badge blue), served from this repository
const mobileIcon = 'https://raw.githubusercontent.com/djav1985/v-serpbear/main/public/email/mobile.png';
const desktopIcon = 'https://serpbear.b-cdn.net/Dx3u0XD.png';
const googleIcon = 'https://serpbear.b-cdn.net/Sx3u0X9.png';

const resolveEmailBranding = () => {
   ensureBrandingAssets();
   const brandingDetails = getBranding();
   const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
   // buildLogoUrl without an origin returns a relative path, which email clients cannot load; use the default logo instead
   const logoUrl = baseUrl ? buildLogoUrl(baseUrl) : '';

   return {
      ...brandingDetails,
      emailLogo: logoUrl || DEFAULT_BRAND_LOGO,
   } as const;
};

type SCStatsObject = {
   [key:string]: {
      html: string,
      label: string,
      clicks?: number,
      impressions?: number
   },
}

/** Rank used for a keyword that is not in the results (position 0) when working out its position change. */
const UNRANKED_FALLBACK_POSITION = 100;

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
               date: historyKeyToTime(dateKey),
               dateRaw: dateKey,
               position: history[dateKey],
            }));
      const historySorted = historyArray.sort((a, b) => a.date - b.date);
      const previousPos = historySorted[historySorted.length - 2].position;
      // An unranked keyword (0) counts as the same fallback rank on both sides, so a move in one direction is
      // reported with the same size as the move back (0 -> 15 is +85, 15 -> 0 is -85).
      status = (previousPos || UNRANKED_FALLBACK_POSITION) - (position || UNRANKED_FALLBACK_POSITION);
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
 * Escapes user-supplied text (keywords, domains, Search Console queries and pages) before it is put in HTML.
 */
const escapeHtml = (value: unknown): string => String(value ?? '')
   .replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&#39;');

const resolveStatNumber = (value: number | undefined | null, fallback = 0): number => {
   if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
   }
   return fallback;
};

/**
 * Generate the Email HTML based on given domain name and its keywords
 * @param {string} domainName - Keywords to scrape
 * @param {keywords[]} keywords - Keywords to scrape
 * @returns {Promise}
 */
const generateEmail = async (domain:DomainType, keywords:KeywordType[], settings: SettingsType) : Promise<string> => {
   const domainName = domain.domain;
   const emailTemplate = await readFile(path.join(process.cwd(), 'email', 'email.html'), { encoding: 'utf-8' });
   const currentDate = formatDateKey(todayKey(APP_TIMEZONE), { month: 'long', day: 'numeric', year: 'numeric' });
   const keywordsCount = keywords.length;
   let improved = 0; let declined = 0;

   let keywordsTable = '';

   keywords.forEach((keyword) => {
      let positionChangeIcon = '';

      const positionChange = getPositionChange(keyword.history, keyword.position);
      const deviceIconImg = keyword.device === 'desktop' ? desktopIcon : mobileIcon;
      const countryFlag = `<img class="flag" src="https://flagcdn.com/w20/${escapeHtml(String(keyword.country ?? '').toLowerCase())}.png" alt="${escapeHtml(keyword.country)}" title="${escapeHtml(keyword.country)}" />`;
      const deviceIcon = `<img class="device" src="${deviceIconImg}" alt="${escapeHtml(keyword.device)}" title="${escapeHtml(keyword.device)}" width="18" height="18" />`;
      const removedAt = typeof keyword.mapPackRemovedAt === 'string' ? keyword.mapPackRemovedAt : '';
      let mapPackFlag = '';
      if (normalizeToBoolean(keyword.mapPackTop3)) {
         mapPackFlag = `<span class="map-pack-flag" role="img" aria-label="Map pack top three">MAP</span>`;
      } else if (removedAt) {
         // Red badge: it was in the map pack and dropped out on this day
         const label = escapeHtml(`Dropped out of the map pack on ${removedAt}`);
         mapPackFlag = `<span class="map-pack-flag map-pack-flag--removed" role="img" aria-label="${label}" title="${label}">MAP</span>`;
      }
      const flagStack = `<span class="flag-stack">${countryFlag}${mapPackFlag}</span>`;

      if (positionChange > 0) { positionChangeIcon = '<span style="color:#5ed7c3;">▲</span>'; improved += 1; }
      if (positionChange < 0) { positionChangeIcon = '<span style="color:#fca5a5;">▼</span>'; declined += 1; }

      const posChangeIcon = positionChange ? `<span class="pos_change">${positionChangeIcon} ${positionChange}</span>` : '';
      const locationParts = parseLocation(keyword.location, keyword.country);
      const locationText = [locationParts.city, locationParts.state].filter(Boolean).join(', ');

      keywordsTable += `<tr class="keyword">
                           <td>${flagStack}</td>
                           <td>${deviceIcon} ${escapeHtml(keyword.keyword)}</td>
                           <td>${locationText ? `(${escapeHtml(locationText)})` : ''}</td>
                           <td>${keyword.position}${posChangeIcon}</td>
                           <td>${getBestKeywordPosition(keyword.history)}</td>
                        </tr>`;
   });

   const improvedStat = improved > 0 ? `${improved} Improved` : '';
   const declinedStat = declined > 0 ? `${declined} Declined` : '';
   const stat = [improvedStat, declinedStat].filter(Boolean).join(', ');
   // Same rule as updateDomainStats (utils/averagePosition): the penalty uses the domain's scrape depth
   const keywordSummary = summarizeAveragePosition(keywords, getUnrankedPenalty(settings, domain));
   const keywordsTrackedStat = resolveStatNumber(domain.keywordsTracked, keywordsCount);
   // Always calculate avgPosition from keywords to ensure accuracy for email
   // Map Pack count should prefer a persisted domain stat when it exists, but fall back to
   // keyword-derived numbers to support legacy domains without the persisted value.
   const avgPositionStat = keywordSummary.avgPosition;
   const mapPackKeywordsStat = resolveStatNumber(
      domain.mapPackKeywords,
      keywordSummary.mapPackKeywords,
   );
   const availableScrapers = Array.isArray(settings.available_scapers) ? settings.available_scapers : [];
   const activeScraper = availableScrapers.find((scraper) => scraper.value === settings.scraper_type);
   const showMapPackStat = activeScraper?.supportsMapPack === true;
   const trackerSummaryStats = [
      {
         label: 'Keywords',
         value: keywordsTrackedStat.toLocaleString('en-US'),
      },
      {
         label: 'Avg position',
         value: formatAveragePosition(avgPositionStat),
      },
   ];

   if (showMapPackStat) {
      trackerSummaryStats.push({
         label: 'Map Pack',
         value: mapPackKeywordsStat.toLocaleString('en-US'),
      });
   }

   const trackerSummaryCells = trackerSummaryStats.map((item) => `
                                 <td class="mini_stats__cell">
                                    <span class="mini_stats__label">${item.label}</span>
                                    <span class="mini_stats__value">${item.value}</span>
                                 </td>
                              `).join('');

   const domainStatsHTML = `<table role="presentation" border="0" cellpadding="0" cellspacing="0" class="mini_stats">
                              <tbody>
                                 <tr>
                                    <td class="mini_stats__header" colspan="${trackerSummaryStats.length}">
                                       <span class="mini_stats__badge">Tracker</span>
                                       <span class="mini_stats__title">Summary</span>
                                    </td>
                                 </tr>
                                 <tr class="mini_stats__row">
                                    ${trackerSummaryCells}
                                 </tr>
                              </tbody>
                           </table>`;

   const { emailLogo, platformName: brandName } = resolveEmailBranding();

   const isConsoleIntegrated = !!(process.env.SEARCH_CONSOLE_PRIVATE_KEY && process.env.SEARCH_CONSOLE_CLIENT_EMAIL)
      || (settings.search_console_client_email && settings.search_console_private_key);
   const htmlWithSCStats = isConsoleIntegrated ? await generateGoogleConsoleStats(domain) : '';

   // One pass over the template only: text inserted for a token (keyword names, SC queries) is never scanned for
   // further {{tokens}}, so a keyword containing "{{SCStatsTable}}" cannot pull in other content.
   const tokenValues: Record<string, string> = {
      logo: `<img class="logo_img" src="${escapeHtml(emailLogo)}" alt="${escapeHtml(brandName)}" width="24" height="24" />`,
      platformName: escapeHtml(brandName),
      currentDate,
      domainName: escapeHtml(domainName),
      keywordsCount: keywordsCount.toString(),
      keywordsTable,
      domainStats: domainStatsHTML,
      appURL: escapeHtml(process.env.NEXT_PUBLIC_APP_URL || ''),
      stat,
      preheader: stat,
      SCStatsTable: htmlWithSCStats,
   };
   const emailHTML = emailTemplate.replace(/\{\{(\w+)\}\}/g, (match, token: string) => (
      Object.prototype.hasOwnProperty.call(tokenValues, token) ? tokenValues[token] : match
   ));

   return emailHTML;
};

/**
 * Generate the Email HTML for Google Search Console Data.
 * @param {string} domainName - The Domain name for which to generate the HTML.
 * @returns {Promise<string>}
 */
export const generateGoogleConsoleStats = async (domain:DomainType): Promise<string> => {
      const initialSCData = await readLocalSCData(domain.domain);
      let localSCData:SCDomainDataType | null = initialSCData === false ? null : initialSCData;
      const hasStats = !!(localSCData?.stats && localSCData.stats.length);
      const lastFetched = localSCData?.statsLastFetched;
      const isFresh = hasStats && isSearchConsoleDataFreshForToday(lastFetched);
      if (!isFresh) {
         const scDomainAPI = domain.search_console ? await getSearchConsoleApiInfo(domain) : { client_email: '', private_key: '' };
         const scGlobalAPI = await getSearchConsoleApiInfo({} as DomainType);
         if (scDomainAPI.client_email || scGlobalAPI.client_email) {
            const refreshed = await fetchDomainSCData(domain, scDomainAPI, scGlobalAPI);
            if (refreshed && refreshed.stats && refreshed.stats.length) {
               localSCData = refreshed;
            }
         }
      }
      if (!localSCData || !localSCData.stats || !localSCData.stats.length) {
         return '';
      }

      const scData:SCStatsObject = {
                        stats: { html: '', label: 'Performance for Last 7 Days', clicks: 0, impressions: 0 },
                        keywords: { html: '', label: 'Top 5 Keywords' },
                        pages: { html: '', label: 'Top 5 Pages' },
                     };
      const SCStats = localSCData.stats.slice(-7).reverse();
      const keywords = getKeywordsInsight(localSCData, 'clicks', 'sevenDays');
      const pages = getPagesInsight(localSCData, 'clicks', 'sevenDays');
      const genColumn = (item:SCInsightItem, firstColumKey:string):string => `<tr class="keyword">
                  <td>${escapeHtml(item[firstColumKey as keyof SCInsightItem])}</td>
                  <td>${item.clicks}</td>
                  <td>${item.impressions}</td>
                  <td>${Math.round(item.position)}</td>
               </tr>`;
      if (SCStats.length > 0) {
         scData.stats.html = SCStats.reduce((acc, item) => acc + genColumn(item, 'date'), '');
      }
      if (keywords.length > 0) {
         scData.keywords.html = keywords.slice(0, 5).reduce((acc, item) => acc + genColumn(item, 'keyword'), '');
      }
      if (pages.length > 0) {
         scData.pages.html = pages.slice(0, 5).reduce((acc, item) => acc + genColumn(item, 'page'), '');
      }
      scData.stats.clicks = SCStats.reduce((acc, item) => acc + item.clicks, 0);
      scData.stats.impressions = SCStats.reduce((acc, item) => acc + item.impressions, 0);

      // Create Stats Start, End Date
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      // SC dates are "YYYY-MM-DD" day keys. Read them as UTC (dateKeyToTime) so the label shows the day the key names.
      const dayMonthLabel = (key: string): string => {
         const time = new Date(dateKeyToTime(key));
         return `${time.getUTCDate()} ${months[time.getUTCMonth()]}`;
      };
      const endLabel = dayMonthLabel(SCStats[0].date);
      const startLabel = dayMonthLabel(SCStats[SCStats.length - 1].date);

      // Add the SC header Title
      let htmlWithSCStats = `<table role="presentation" border="0" cellpadding="0" cellspacing="0" class="console_table">
                              <tr>
                                 <td style="font-weight:bold;">
                                 <img class="google_icon" src="${googleIcon}" alt="Google" width="13" height="13"> Google Search Console Stats
                                 </td>
                                 <td class="stat" align="right" style="font-size: 12px;">
                                 ${startLabel} -  ${endLabel}
                                 (Last 7 Days)
                                 </td>
                              </tr>
                           </table>
                           `;

      // Add the SC Data Tables
      Object.keys(scData).forEach((itemKey) => {
         const scItem = scData[itemKey as keyof SCStatsObject];
         const scItemFirstColName = itemKey === 'stats' ? 'Date' : `${itemKey[0].toUpperCase()}${itemKey.slice(1)}`;
         htmlWithSCStats += `<table role="presentation" border="0" cellpadding="0" cellspacing="0" class="subhead">
                                 <tr>
                                    <td style="font-weight:bold;">${scItem.label}</td>
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

export default generateEmail;
