import { resolveCountryCode } from "../../utils/scraperHelpers";
import { DEVICE_MOBILE } from "../../utils/constants";
import { logger } from "../../utils/logger";

interface TinyFishResult {
  title: string;
  url: string;
  position: number;
}

const tinyfish: ScraperSettings = {
  id: "tinyfish",
  name: "TinyFish",
  // TinyFish is targeted by country only (location and language): a stored city location is intentionally not sent,
  // and allowsCity is false so the UI does not offer it. It returns no map pack.
  supportsMapPack: false,
  reusesDesktopForMobile: true,
  // Personal accounts are limited to 30 requests a minute, so requests are spaced 2 seconds apart
  minRequestIntervalMs: 2000,
  method: "GET",
  allowsCity: false,
  usesResultOffset: false,
  // TinyFish returns real page URLs, so nothing is sent to Serper's /resolve
  resolveGoogleUrl: false,
  headers: (_keyword, settings) => ({
    "X-API-Key": settings.scraping_api ?? "",
  }),
  scrapeURL: (keyword, _settings, countryData, pagination?: ScraperPagination) => {
    const countryCode = resolveCountryCode(keyword.country);
    const localeInfo =
      countryData[countryCode] ??
      countryData.US ??
      Object.values(countryData)[0];
    const lang = localeInfo?.[2] ?? "en";
    const p = pagination || { start: 0, num: 10, page: 1 };
    // TinyFish has no device parameter, so mobile results cannot be requested.
    if (keyword.device === DEVICE_MOBILE) {
      logger.warn(`TinyFish does not support mobile results; keyword "${keyword.keyword}" is checked against desktop results`);
    }
    const params = new URLSearchParams();
    params.set("query", keyword.keyword);
    params.set("location", countryCode);
    params.set("language", lang);
    // TinyFish pages are zero-indexed
    params.set("page", String(Math.max(p.page - 1, 0)));
    return `https://api.search.tinyfish.ai?${params.toString()}`;
  },
  resultObjectKey: "results",
  serpExtractor: ({ result, response }) => {
    const extractedResult = [];
    let results: TinyFishResult[] = [];

    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        results = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        throw new Error(
          `Invalid JSON response for TinyFish: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    } else if (Array.isArray(result)) {
      results = result as TinyFishResult[];
    } else if (Array.isArray(response?.results)) {
      results = response.results as TinyFishResult[];
    }

    for (const { url, title, position } of results) {
      if (title && url) {
        extractedResult.push({ title, url, position });
      }
    }

    return { organic: extractedResult };
  },
};

export default tinyfish;
