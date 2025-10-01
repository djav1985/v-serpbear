import countries from '../../utils/countries';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import { parseLocation } from '../../utils/location';
import { computeMapPackTop3 } from '../../utils/mapPack';

const GOOGLE_DOMAINS: Record<string, string> = {
   AE: 'google.ae',
   AR: 'google.com.ar',
   AT: 'google.at',
   AU: 'google.com.au',
   BD: 'google.com.bd',
   BE: 'google.be',
   BG: 'google.bg',
   BH: 'google.com.bh',
   BR: 'google.com.br',
   BY: 'google.by',
   CA: 'google.ca',
   CH: 'google.ch',
   CL: 'google.cl',
   CN: 'google.cn',
   CO: 'google.com.co',
   CZ: 'google.cz',
   DE: 'google.de',
   DK: 'google.dk',
   DO: 'google.com.do',
   EC: 'google.com.ec',
   EG: 'google.com.eg',
   ES: 'google.es',
   FI: 'google.fi',
   FR: 'google.fr',
   GB: 'google.co.uk',
   GR: 'google.gr',
   GT: 'google.com.gt',
   HK: 'google.com.hk',
   HN: 'google.hn',
   HR: 'google.hr',
   HU: 'google.hu',
   ID: 'google.co.id',
   IE: 'google.ie',
   IL: 'google.co.il',
   IN: 'google.co.in',
   IQ: 'google.iq',
   IR: 'google.ir',
   IS: 'google.is',
   IT: 'google.it',
   JM: 'google.com.jm',
   JO: 'google.jo',
   JP: 'google.co.jp',
   KE: 'google.co.ke',
   KR: 'google.co.kr',
   KW: 'google.com.kw',
   KZ: 'google.kz',
   LB: 'google.com.lb',
   LT: 'google.lt',
   LU: 'google.lu',
   LV: 'google.lv',
   LY: 'google.com.ly',
   MA: 'google.co.ma',
   MM: 'google.com.mm',
   MX: 'google.com.mx',
   MY: 'google.com.my',
   NG: 'google.com.ng',
   NI: 'google.com.ni',
   NL: 'google.nl',
   NO: 'google.no',
   NZ: 'google.co.nz',
   OM: 'google.com.om',
   PA: 'google.com.pa',
   PE: 'google.com.pe',
   PH: 'google.com.ph',
   PK: 'google.com.pk',
   PL: 'google.pl',
   PR: 'google.com.pr',
   PT: 'google.pt',
   PY: 'google.com.py',
   QA: 'google.com.qa',
   RO: 'google.ro',
   RS: 'google.rs',
   RU: 'google.ru',
   SA: 'google.com.sa',
   SE: 'google.se',
   SG: 'google.com.sg',
   SI: 'google.si',
   SK: 'google.sk',
   TH: 'google.co.th',
   TR: 'google.com.tr',
   TT: 'google.tt',
   TW: 'google.com.tw',
   UA: 'google.com.ua',
   US: 'google.com',
   UY: 'google.com.uy',
   VE: 'google.co.ve',
   VN: 'google.com.vn',
   ZA: 'google.co.za',
};

interface ValueSerpResult {
   title: string,
   link: string,
   position: number,
   domain: string,
}

const valueSerp:ScraperSettings = {
   id: 'valueserp',
   name: 'Value Serp',
   website: 'valueserp.com',
   allowsCity: true,
   timeoutMs: 35000, // ValueSerp responses often take longer, allow 35 seconds
   scrapeURL: (keyword, settings, countryData) => {
      const resolvedCountry = resolveCountryCode(keyword.country) || 'US';
      const normalizedCountry = resolvedCountry.toUpperCase();
      const countryName = countries[normalizedCountry]?.[0] ?? countries.US[0];
      const { city, state } = parseLocation(keyword.location, keyword.country);
      const locationParts = [city, state, countryName].filter(Boolean);
      const fallbackCountryData = countryData?.US ?? ['United States', 'Washington, D.C.', 'en'];
      const lang = (countryData?.[normalizedCountry] ?? fallbackCountryData)[2];
      const googleDomain = GOOGLE_DOMAINS[normalizedCountry] ?? 'google.com';
      const params = new URLSearchParams();
      params.set('api_key', settings.scraping_api ?? '');
      params.set('q', keyword.keyword);
      params.set('gl', normalizedCountry.toLowerCase());
      params.set('hl', lang);
      params.set('output', 'json');
      params.set('include_answer_box', 'false');
      params.set('include_advertiser_info', 'false');
      params.set('google_domain', googleDomain);

      if (keyword.device === 'mobile') {
         params.set('device', 'mobile');
      }

      if (locationParts.length) {
         params.set('location', locationParts.join(','));
      }

      return `https://api.valueserp.com/search?${params.toString()}`;
   },
   resultObjectKey: 'organic_results',
   supportsMapPack: true,
   serpExtractor: ({ result, response, keyword }) => {
      const extractedResult = [];
      let results: ValueSerpResult[] = [];
      if (typeof result === 'string') {
         try {
            results = JSON.parse(result) as ValueSerpResult[];
         } catch (error) {
            throw new Error(`Invalid JSON response for Value Serp: ${error instanceof Error ? error.message : error}`);
         }
      } else if (Array.isArray(result)) {
         results = result as ValueSerpResult[];
      } else if (Array.isArray(response?.organic_results)) {
         results = response.organic_results as ValueSerpResult[];
      }
      for (const item of results) {
         if (item?.title && item?.link) {
            extractedResult.push({
               title: item.title,
               url: item.link,
               position: item.position,
            });
         }
      }

      const mapPackTop3 = computeMapPackTop3(keyword.domain, response);

      return { organic: extractedResult, mapPackTop3 };
   },
};

export default valueSerp;
