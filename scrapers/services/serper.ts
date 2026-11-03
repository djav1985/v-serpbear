import { resolveCountryCode, getKeywordLocationParts } from "../../utils/scraperHelpers";

const decodeIfEncoded = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};

interface SerperResult {
  title: string;
  link: string;
  position: number;
}

const serper: ScraperSettings = {
  id: "serper",
  name: "Serper.dev",
  website: "serper.dev",
  allowsCity: true,
  supportsMapPack: false,
  scrapeURL: (keyword, settings, countryData, pagination?: ScraperPagination) => {
    const countryCode = resolveCountryCode(keyword.country);
    const fallbackInfo =
      countryData[countryCode] ??
      countryData.US ??
      Object.values(countryData)[0];
    const gl = countryCode;
    const lang = fallbackInfo?.[2] ?? "en";
    const locationParts = getKeywordLocationParts(keyword.location);
    const p = pagination || { start: 0, num: 10, page: 1 };
    const params = new URLSearchParams();
    params.set("q", decodeIfEncoded(keyword.keyword));
    if (locationParts.length) {
      params.set("location", locationParts.join(","));
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
