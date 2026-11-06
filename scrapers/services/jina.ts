import { resolveCountryCode } from "../../utils/scraperHelpers";
import { DEVICE_MOBILE } from "../../utils/constants";
import { logger } from "../../utils/logger";

interface JinaResult {
  title: string;
  url: string;
}

const jina: ScraperSettings = {
  id: "jina",
  name: "Jina AI",
  // Jina is targeted by country only (gl and hl): a stored city location is intentionally not sent, and
  // allowsCity is false so the UI does not offer it. It returns no map pack.
  allowsCity: false,
  supportsMapPack: false,
  usesResultOffset: false,
  reusesDesktopForMobile: true,
  // Jina returns real page URLs, so nothing is sent to Serper's /resolve
  resolveGoogleUrl: false,
  // No baseline spacing between requests
  minRequestIntervalMs: 0,
  method: "GET",
  headers: (_keyword, settings) => ({
    Accept: "application/json",
    Authorization: `Bearer ${settings.scraping_api ?? ""}`,
    // Only the result list is needed, not the page content of each result
    "X-Respond-With": "no-content",
  }),
  scrapeURL: (keyword, _settings, countryData, pagination?: ScraperPagination) => {
    const countryCode = resolveCountryCode(keyword.country);
    const localeInfo =
      countryData[countryCode] ??
      countryData.US ??
      Object.values(countryData)[0];
    const lang = localeInfo?.[2] ?? "en";
    const p = pagination || { start: 0, num: 10, page: 1 };
    // Jina has no device parameter, so mobile results cannot be requested.
    if (keyword.device === DEVICE_MOBILE) {
      logger.warn(`Jina AI does not support mobile results; keyword "${keyword.keyword}" is checked against desktop results`);
    }
    const params = new URLSearchParams();
    params.set("q", keyword.keyword);
    params.set("gl", countryCode);
    params.set("hl", lang);
    if (p.page > 1) {
      params.set("page", String(p.page));
    }
    return `https://s.jina.ai/?${params.toString()}`;
  },
  resultObjectKey: "data",
  serpExtractor: ({ result, response }) => {
    const extractedResult: { title: string; url: string; position: number }[] = [];
    let results: JinaResult[] = [];

    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        results = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        throw new Error(
          `Invalid JSON response for Jina AI: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    } else if (Array.isArray(result)) {
      results = result as JinaResult[];
    } else if (Array.isArray(response?.data)) {
      results = response.data as JinaResult[];
    }

    // Jina results carry no position, so the order of the list is the rank
    results.forEach(({ url, title }, index) => {
      if (title && url) {
        extractedResult.push({ title, url, position: index + 1 });
      }
    });

    return { organic: extractedResult };
  },
};

export default jina;
