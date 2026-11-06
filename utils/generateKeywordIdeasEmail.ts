import dayjs from 'dayjs';

export type KeywordIdeasEmailKeyword = {
   keyword: string;
   avgMonthlySearches?: number;
   monthlySearchVolumes?: Record<string, number>;
   competition?: string;
   competitionIndex?: number;
};

type GenerateKeywordIdeasEmailParams = {
   domain: string;
   keywords: KeywordIdeasEmailKeyword[];
   platformName?: string;
};

const escapeHtml = (value: string): string => value
   .replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&#39;');

const formatNumber = (value?: number): string => {
   if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toLocaleString('en-US');
   }
   return '—';
};

const parsePeriodOrder = (period: string): number => {
   const strictMonth = dayjs(period, 'YYYY-MM', true);
   if (strictMonth.isValid()) {
      return strictMonth.valueOf();
   }
   const looseDate = dayjs(period);
   if (looseDate.isValid()) {
      return looseDate.valueOf();
   }
   return Number.MAX_SAFE_INTEGER;
};

const formatPeriodLabel = (period: string): string => {
   const strictMonth = dayjs(period, 'YYYY-MM', true);
   if (strictMonth.isValid()) {
      return strictMonth.format('MMM YYYY');
   }
   const looseDate = dayjs(period);
   if (looseDate.isValid()) {
      return looseDate.format('MMM YYYY');
   }
   return period;
};

const buildTrendList = (monthlyVolumes: Record<string, number> = {}): string => {
   const entries = Object.entries(monthlyVolumes);
   if (entries.length === 0) {
      return '<em style="color:#6b7280;">No data</em>';
   }
   const sortedEntries = entries.sort((a, b) => parsePeriodOrder(a[0]) - parsePeriodOrder(b[0]));
   const listItems = sortedEntries.map(([period, value]) => {
      const label = escapeHtml(formatPeriodLabel(period));
      const formattedValue = formatNumber(value);
      return `<li style="margin:0; padding:0;">${label}: <strong>${formattedValue}</strong></li>`;
   }).join('');
   return `<ul style="margin:0; padding-left:16px; color:#111827;">${listItems}</ul>`;
};

const formatCompetition = (competition?: string, index?: number): string => {
   const pieces: string[] = [];
   if (competition) {
      pieces.push(escapeHtml(competition));
   }
   if (typeof index === 'number' && Number.isFinite(index)) {
      const formattedIndex = index.toFixed(2).replace(/\.00$/, '');
      pieces.push(`Index ${formattedIndex}`);
   }
   if (pieces.length === 0) {
      return '—';
   }
   return pieces.join(' · ');
};

const buildRows = (keywords: KeywordIdeasEmailKeyword[]): string => {
   if (!keywords.length) {
      return `<tr>
         <td colspan="4" style="padding:16px; border-top:1px solid #e5e7eb; text-align:center; color:#6b7280;">
            No keyword ideas were selected.
         </td>
      </tr>`;
   }

   return keywords.map((keyword) => {
      const keywordLabel = keyword.keyword ? escapeHtml(keyword.keyword) : '—';
      const averageSearches = formatNumber(keyword.avgMonthlySearches);
      const trendHtml = buildTrendList(keyword.monthlySearchVolumes);
      const competition = formatCompetition(keyword.competition, keyword.competitionIndex);

      return `<tr>
         <td style="padding:12px 16px; border-top:1px solid #e5e7eb; vertical-align:top;">${keywordLabel}</td>
         <td style="padding:12px 16px; border-top:1px solid #e5e7eb; vertical-align:top; text-align:right;">${averageSearches}</td>
         <td style="padding:12px 16px; border-top:1px solid #e5e7eb; vertical-align:top;">${trendHtml}</td>
         <td style="padding:12px 16px; border-top:1px solid #e5e7eb; vertical-align:top;">${competition}</td>
      </tr>`;
   }).join('');
};

const generateKeywordIdeasEmail = ({ domain, keywords, platformName }: GenerateKeywordIdeasEmailParams): string => {
   const safeDomain = escapeHtml(domain);
   const headerTitle = platformName ? `${escapeHtml(platformName)} Keyword Ideas` : 'Keyword Ideas';
   const keywordCount = keywords.length;
   const subtitle = keywordCount === 1
      ? 'You selected 1 keyword idea. Review the details below.'
      : `You selected ${keywordCount} keyword ideas. Review the details below.`;

   const tableRows = buildRows(keywords);

   return `<!DOCTYPE html>
<html lang="en">
<head>
   <meta charset="utf-8" />
   <title>${headerTitle}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#111827;">
   <div style="max-width:720px; margin:0 auto; padding:24px;">
      <div style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.08);">
         <div style="background-color:#1f2937; color:#f9fafb; padding:24px;">
            <h1 style="margin:0; font-size:22px;">${headerTitle} for ${safeDomain}</h1>
            <p style="margin:8px 0 0; font-size:16px; color:#e5e7eb;">${escapeHtml(subtitle)}</p>
         </div>
         <div style="padding:24px;">
            <table style="width:100%; border-collapse:collapse;">
               <thead>
                  <tr style="background-color:#f9fafb; text-align:left;">
                     <th style="padding:12px 16px; font-size:14px; text-transform:uppercase; letter-spacing:0.08em; color:#6b7280;">Keyword</th>
                     <th style="padding:12px 16px; font-size:14px; text-transform:uppercase; letter-spacing:0.08em; color:#6b7280; text-align:right;">Monthly Search</th>
                     <th style="padding:12px 16px; font-size:14px; text-transform:uppercase; letter-spacing:0.08em; color:#6b7280;">Search Trend</th>
                     <th style="padding:12px 16px; font-size:14px; text-transform:uppercase; letter-spacing:0.08em; color:#6b7280;">Competition</th>
                  </tr>
               </thead>
               <tbody>
                  ${tableRows}
               </tbody>
            </table>
         </div>
      </div>
   </div>
</body>
</html>`;
};

export default generateKeywordIdeasEmail;
