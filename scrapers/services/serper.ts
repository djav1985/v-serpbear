import { resolveCountryCode } from "../../utils/scraperHelpers";
import { DEVICE_MOBILE } from "../../utils/constants";
import { logger } from "../../utils/logger";

interface SerperResult {
  title: string;
  link: string;
  position: number;
}

const serper: ScraperSettings = {
  id: "serper",
  // Google redirect links in the results are resolved through Serper's /resolve (needs SERPER_API_KEY)
  resolveGoogleUrl: true,
  // No baseline spacing between requests
  minRequestIntervalMs: 0,
  method: "GET",
  allowsCity: false,
  usesResultOffset: false,
  name: "Serper.dev",
  // Serper is targeted by country only (gl and hl): a stored city location is intentionally not sent, and
  // allowsCity is false so the UI does not offer it.
  supportsMapPack: false,
  reusesDesktopForMobile: true,
  scrapeURL: (keyword, settings, countryData, pagination?: ScraperPagination) => {
    const countryCode = resolveCountryCode(keyword.country);
    const fallbackInfo =
      countryData[countryCode] ??
      countryData.US ??
      Object.values(countryData)[0];
    const gl = countryCode.toLowerCase();
    const lang = fallbackInfo?.[2] ?? "en";
    const p = pagination || { start: 0, num: 10, page: 1 };
    const params = new URLSearchParams();
    params.set("q", keyword.keyword);
    // Serper's /search endpoint has no device parameter (only q, location, gl, hl, page, num, tbs and similar),
    // so mobile results cannot be requested. Warn for every mobile keyword instead of silently returning desktop results.
    if (keyword.device === DEVICE_MOBILE) {
      logger.warn(`Serper.dev does not support mobile results; keyword "${keyword.keyword}" is checked against desktop results`);
    }
    params.set("gl", gl);
    params.set("hl", lang);
    params.set("page", String(p.page));
    params.set("apiKey", settings.scraping_api ?? "");
    return `https://google.serper.dev/search?${params.toString()}`;
  },
  resultObjectKey: "organic",
  serpExtractor: ({ result, response }) => {
    const extractedResult = [];
    let results: SerperResult[] = [];

    if (typeof result === "string") {
      try {
        results = JSON.parse(result) as SerperResult[];
      } catch (error) {
        throw new Error(
          `Invalid JSON response for Serper.dev: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    } else if (Array.isArray(result)) {
      results = result as SerperResult[];
    } else if (Array.isArray(response?.organic)) {
      results = response.organic as SerperResult[];
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

    return { organic: extractedResult };
  },
};

export default serper;
