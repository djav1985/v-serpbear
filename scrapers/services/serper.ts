import { resolveCountryCode, getKeywordLocationParts } from "../../utils/scraperHelpers";
import { DEVICE_MOBILE } from "../../utils/constants";
import { logger } from "../../utils/logger";

let mobileWarningLogged = false;

interface SerperResult {
  title: string;
  link: string;
  position: number;
}

const serper: ScraperSettings = {
  id: "serper",
  name: "Serper.dev",
  allowsCity: true,
  supportsMapPack: false,
  scrapeURL: (keyword, settings, countryData, pagination?: ScraperPagination) => {
    const countryCode = resolveCountryCode(keyword.country);
    const fallbackInfo =
      countryData[countryCode] ??
      countryData.US ??
      Object.values(countryData)[0];
    const gl = countryCode.toLowerCase();
    const lang = fallbackInfo?.[2] ?? "en";
    const locationParts = getKeywordLocationParts(keyword.location);
    const p = pagination || { start: 0, num: 10, page: 1 };
    const params = new URLSearchParams();
    params.set("q", keyword.keyword);
    if (locationParts.length) {
      params.set("location", locationParts.join(","));
    }
    // Serper's /search endpoint has no device parameter (only q, location, gl, hl, page, num, tbs and similar),
    // so mobile results cannot be requested. Warn once per run instead of silently returning desktop results.
    if (keyword.device === DEVICE_MOBILE && !mobileWarningLogged) {
      mobileWarningLogged = true;
      logger.warn("Serper.dev does not support mobile results; mobile keywords are checked against desktop results");
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
