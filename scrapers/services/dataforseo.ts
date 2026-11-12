import countries, { getGoogleDomain } from "../../utils/countries";
import { resolveCountryCode, getKeywordLocationParts, fetchAccountJson, toCreditNumber } from "../../utils/scraperHelpers";
import { computeMapPackTop3 } from "../../utils/mapPack";
import { DEVICE_MOBILE } from "../../utils/constants";
import { asRecordArray, getPathValue } from "../../utils/typeGuards";

const DATAFORSEO_SUCCESS = 20000;

interface DataForSeoItem {
  type: string;
  title?: string;
  url?: string;
  rank_absolute?: number;
  rank_group?: number;
}

interface DataForSeoTask {
  status_code?: number;
  status_message?: string;
  result?: { items?: DataForSeoItem[] }[];
}

// DataForSEO requires a location_name: the stored location when present, otherwise the country name
const buildLocationName = (keyword: KeywordType, countryName: string): string => {
  const [location] = getKeywordLocationParts(keyword.location);
  return location || countryName;
};

const getTask = (response: unknown): DataForSeoTask | undefined => asRecordArray(getPathValue(response, 'tasks'))[0] as DataForSeoTask | undefined;

const dataforseo: ScraperSettings = {
  id: "dataforseo",
  name: "DataForSEO",
  // The balance is money in US dollars, not a count of credits.
  creditsUnit: "usd",
  fetchCredits: async (settings: SettingsType) => {
    const auth = Buffer.from(settings.scraping_api ?? "").toString("base64");
    const data = await fetchAccountJson("https://api.dataforseo.com/v3/appendix/user_data", { Authorization: `Basic ${auth}` });
    return toCreditNumber(getPathValue(data, 'tasks', '0', 'result', '0', 'money', 'balance'));
  },
  allowsCity: true,
  supportsMapPack: true,
  timeoutMs: 30000,
  resultObjectKey: "tasks",
  method: "POST",
  // The scraping_api setting holds "login:password" for HTTP Basic auth.
  headers: (_keyword: KeywordType, settings: SettingsType) => ({
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(settings.scraping_api ?? "").toString("base64")}`,
  }),
  scrapeURL: () => "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
  body: (
    keyword: KeywordType,
    _settings: SettingsType,
    countryData: countryData,
    pagination?: ScraperPagination,
  ) => {
    const country = resolveCountryCode(keyword.country);
    const countryInfo = countries[country] ?? countries.US;
    const countryName = countryInfo?.[0] ?? countries.US[0];
    const localeInfo =
      countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
    const lang = localeInfo?.[2] ?? "en";
    const p = pagination || { start: 0, num: 10, page: 1 };

    // depth must reach the end of the requested page; the extractor slices it.
    return [
      {
        keyword: keyword.keyword,
        location_name: buildLocationName(keyword, countryName),
        language_code: lang,
        device: keyword.device === DEVICE_MOBILE ? "mobile" : "desktop",
        se_domain: getGoogleDomain(country),
        depth: Math.min(p.start + p.num, 100),
      },
    ];
  },
  serpExtractor: ({ response, settings, pagination }) => {
    const task = getTask(response);
    if (!task) {
      throw new Error("Invalid response for DataForSEO: missing tasks");
    }
    if (task.status_code !== DATAFORSEO_SUCCESS) {
      throw new Error(
        `DataForSEO error ${task.status_code}: ${task.status_message ?? "Request failed"}`,
      );
    }

    const items = task.result?.[0]?.items ?? [];
    const start = pagination?.start ?? 0;
    const num = pagination?.num ?? 10;

    // The request depth counts every SERP item (ads and features included), so the page is picked by absolute rank,
    // not by slicing the organic-only list, which would skip or repeat ranks when non-organic items are present.
    const organic = items
      .filter((item) => item.type === "organic" && item.title && item.url)
      .map((item, index) => ({
        title: item.title as string,
        url: item.url as string,
        position: item.rank_absolute ?? index + 1,
      }))
      .filter((item) => item.position > start && item.position <= start + num);

    const businessName = (settings as ExtendedSettings)?.business_name ?? null;
    const dfsItems: DataForSeoItem[] = Array.isArray(getTask(response)?.result?.[0]?.items)
      ? (getTask(response)?.result?.[0]?.items as DataForSeoItem[])
      : [];
    const localResults = dfsItems
      .filter((item) => item.type === "local_pack")
      .map((item, index) => ({
        position: index + 1,
        title: item.title as string,
        url: (item.url || undefined) as string | undefined,
      }));
    const mapPackTop3 = computeMapPackTop3(localResults, businessName);

    return { organic, mapPackTop3, localResults };
  },
};

export default dataforseo;
