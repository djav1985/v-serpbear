import countries, { getGoogleDomain } from "../../utils/countries";
import { resolveCountryCode, getKeywordLocationParts } from "../../utils/scraperHelpers";
import { computeMapPackTop3 } from "../../utils/mapPack";
import { DEVICE_MOBILE } from "../../utils/constants";

interface SerpApiResult {
  title: string;
  link: string;
  position: number;
}

const serpapi: ScraperSettings = {
  id: "serpapi",
  name: "SerpApi.com",
  website: "serpapi.com",
  allowsCity: true,
  supportsMapPack: true,
  usesResultOffset: true,
  headers: (_keyword: KeywordType, settings: SettingsType) => ({
    "Content-Type": "application/json",
    "X-API-Key": settings.scraping_api,
  }),
  scrapeURL: (keyword, settings, _countryData, pagination) => {
    const country = resolveCountryCode(keyword.country);
    const locationParts = getKeywordLocationParts(keyword.location);
    const countryInfo = countries[country] ?? countries.US;
    const googleDomain = getGoogleDomain(country);
    const params = new URLSearchParams();
    params.set("engine", "google");
    params.set("q", keyword.keyword);
    if (locationParts.length) {
      params.set("location", locationParts.join(","));
    }
    if (keyword.device === DEVICE_MOBILE) {
      params.set("device", "mobile");
    }
    params.set("google_domain", googleDomain);
    params.set("gl", country);
    params.set("hl", countryInfo?.[2] ?? "en");
    if (pagination && pagination.start > 0) {
      params.set("start", String(pagination.start));
    }
    params.set("api_key", settings.scraping_api ?? "");
    return `https://serpapi.com/search.json?${params.toString()}`;
  },
  resultObjectKey: "organic_results",
  serpExtractor: ({ result, response, settings }) => {
    const extractedResult = [];
    let results: SerpApiResult[] = [];

    if (typeof result === "string") {
      try {
        results = JSON.parse(result) as SerpApiResult[];
      } catch (error) {
        throw new Error(
          `Invalid JSON response for SerpApi.com: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    } else if (Array.isArray(result)) {
      results = result as SerpApiResult[];
    } else if (Array.isArray(response?.organic_results)) {
      results = response.organic_results as SerpApiResult[];
    }

    for (const { link, title, position } of results) {
      if (title && link) {
        extractedResult.push({
          title,
          url: link,
          position,
        });
      }
    }

    const businessName = (settings as ExtendedSettings)?.business_name ?? null;
    const rawLocal: any[] = Array.isArray(response?.local_results?.places) ? response.local_results.places : [];
    const localResults = rawLocal.map((place: any, index: number) => ({
      position: index + 1,
      title: place.title as string,
      url: (place.links?.website || undefined) as string | undefined,
    }));
    const mapPackTop3 = computeMapPackTop3(localResults, businessName);

    return { organic: extractedResult, mapPackTop3, localResults };
  },
};

export default serpapi;
