import { resolveCountryCode, fetchAccountJson, toCreditNumber } from "../../utils/scraperHelpers";
import { computeMapPackTop3 } from "../../utils/mapPack";
import { isGoogleRedirectUrl } from "../../utils/resolveGoogleLinks";

interface SerpBaseOrganic {
  title?: string;
  link?: string;
  url?: string;
  /** Bare domain of the result, with or without a scheme (e.g. "https://m.yelp.com" or "www.facebook.com") */
  display_link?: string;
  /** Rank among organic results on the page; `position` counts every SERP block, so it skips numbers */
  rank?: number;
  position?: number;
}

interface SerpBaseLocal {
  title?: string;
  rank?: number;
}

// display_link is a bare domain, sometimes without a scheme. Used when the result link is a google.com/goto redirect.
const domainUrl = (displayLink?: string): string | null => {
  const value = (displayLink ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return parsed.hostname ? `https://${parsed.hostname}/` : null;
  } catch {
    return null;
  }
};

const serpbase: ScraperSettings = {
  id: "serpbase",
  name: "SerpBase",
  // The account call is free and returns the credits left on the key.
  fetchCredits: async (settings: SettingsType) => {
    const data = await fetchAccountJson("https://api.serpbase.dev/account/credits", { "X-API-Key": settings.scraping_api ?? "" });
    return toCreditNumber(data?.credits);
  },
  supportsMapPack: true,
  timeoutMs: 60000,
  resultObjectKey: "organic",
  method: "POST",
  headers: (_keyword: KeywordType, settings: SettingsType) => ({
    "Content-Type": "application/json",
    "X-API-Key": settings.scraping_api ?? "",
  }),
  scrapeURL: () => "https://api.serpbase.dev/google/search",
  body: (
    keyword: KeywordType,
    _settings: SettingsType,
    countryData: any,
    pagination?: ScraperPagination,
  ) => {
    const country = resolveCountryCode(keyword.country);
    const localeInfo =
      countryData?.[country] ?? countryData?.US ?? Object.values(countryData ?? {})[0];
    const lang = localeInfo?.[2] ?? "en";
    const p = pagination || { start: 0, num: 10, page: 1 };
    const body: Record<string, unknown> = {
      q: keyword.keyword,
      gl: country.toLowerCase(),
      hl: lang,
    };
    if (p.page > 1) {
      body.page = p.page;
    }
    return body;
  },
  serpExtractor: ({ result, response, settings }) => {
    const rawOrganic: SerpBaseOrganic[] = Array.isArray(result)
      ? (result as SerpBaseOrganic[])
      : (Array.isArray(response?.organic) ? response.organic : []);

    const organic = rawOrganic
      .filter((item) => item?.title && (item.link || item.url))
      .map((item, index) => {
        const link = (item.link || item.url) as string;
        // A google.com/goto link cannot be matched to a domain, so fall back to the result's own domain
        const url = isGoogleRedirectUrl(link) ? (domainUrl(item.display_link) ?? link) : link;
        return {
          title: item.title as string,
          url,
          position: item.rank ?? index + 1,
        };
      });

    const businessName = (settings as ExtendedSettings)?.business_name ?? null;
    const localResults = (Array.isArray(response?.local_results) ? response.local_results : [] as SerpBaseLocal[])
      .filter((item: SerpBaseLocal) => item?.title)
      .map((item: SerpBaseLocal, index: number) => ({
        position: item.rank ?? index + 1,
        title: item.title as string,
      }));
    const mapPackTop3 = computeMapPackTop3(localResults, businessName);

    return { organic, mapPackTop3, localResults };
  },
};

export default serpbase;
