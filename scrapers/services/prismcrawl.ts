import { getGoogleDomain } from "../../utils/countries";
import { resolveCountryCode, getKeywordLocationParts } from "../../utils/scraperHelpers";
import { DEVICE_MOBILE } from "../../utils/constants";
import { computeMapPackTop3 } from "../../utils/mapPack";
import { isGoogleRedirectUrl } from "../../utils/resolveGoogleLinks";

interface PrismCrawlResult {
  type: string;
  title?: string;
  url?: string;
  /** Bare domain of the result; set even when `url` is a Google redirect link */
  domain?: string;
  rank?: number;
  position?: { absolute?: number };
}

// Stored location ("City,State,Country Name") as-is; undefined for country-only keywords
const buildLocation = (keyword: KeywordType): string | undefined => {
  const [location] = getKeywordLocationParts(keyword.location);
  return location;
};

const prismcrawl: ScraperSettings = {
  id: "prismcrawl",
  name: "PrismCrawl",
  website: "prismcrawl.com",
  allowsCity: true,
  supportsMapPack: true,
  usesResultOffset: true,
  timeoutMs: 20000,
  resultObjectKey: "data",
  method: "POST",
  headers: (_keyword: KeywordType, settings: SettingsType) => ({
    "Content-Type": "application/json",
    "x-api-key": settings.scraping_api ?? "",
  }),
  scrapeURL: () => "https://api.prismcrawl.com/v1/google/search",
  body: (
    keyword: KeywordType,
    _settings: SettingsType,
    countryData: any,
    pagination?: ScraperPagination,
  ) => {
    const country = resolveCountryCode(keyword.country);
    const localeInfo =
      countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
    const lang = localeInfo?.[2] ?? "en";
    const p = pagination || { start: 0, num: 10, page: 1 };

    const body: Record<string, unknown> = {
      query: keyword.keyword,
      output: "json",
      gl: country.toLowerCase(),
      hl: lang,
      google_domain: getGoogleDomain(country),
      start: p.start,
    };
    const location = buildLocation(keyword);
    if (location) {
      body.location = location;
    }
    if (keyword.device === DEVICE_MOBILE) {
      body.device = "mobile";
    }
    return body;
  },
  serpExtractor: ({ response, settings }) => {
    // Payload shape: { success, data: { content: { results: [...] } } }
    const results: PrismCrawlResult[] = Array.isArray(response?.data?.content?.results)
      ? response.data.content.results
      : [];

    const organic = results
      .filter((item) => item?.type === "organic" && item.title && item.url)
      .map((item, index) => ({
        title: item.title as string,
        url: item.url as string,
        position: item.position?.absolute ?? item.rank ?? index + 1,
        // An unresolved google.com/goto link cannot be matched to a domain, so keep the result's own domain as a fallback
        ...(isGoogleRedirectUrl(item.url) && item.domain ? { fallbackUrl: `https://${item.domain}/` } : {}),
      }));

    const businessName = (settings as ExtendedSettings)?.business_name ?? null;
    const localResults = ((Array.isArray(response?.data?.content?.serp_features) ? response.data.content.serp_features : []) as any[])
      .filter((feature) => feature?.type === "local_results")
      .flatMap((feature) => (Array.isArray(feature.items) ? feature.items : []))
      .map((item: any, index: number) => ({
      position: index + 1,
        title: item.title as string,
        url: (item.link || undefined) as string | undefined,
      }));
    const mapPackTop3 = computeMapPackTop3(localResults, businessName);

    return { organic, mapPackTop3, localResults };
  },
};

export default prismcrawl;
