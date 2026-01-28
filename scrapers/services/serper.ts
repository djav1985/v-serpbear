import { resolveCountryCode } from "../../utils/scraperHelpers";
import { parseLocation } from "../../utils/location";

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

type SerperResponse = {
  organic?: SerperResult[];
};

const serper: ScraperSettings = {
  id: "serper",
  name: "Serper.dev",
  website: "serper.dev",
  allowsCity: true,
  supportsMapPack: false,
  scrapeURL: (keyword, settings, countryData) => {
    const countryCode = resolveCountryCode(keyword.country);
    const fallbackInfo =
      countryData[countryCode] ??
      countryData.US ??
      Object.values(countryData)[0];
    const gl = countryCode;
    const lang = fallbackInfo?.[2] ?? "en";
    const countryName = fallbackInfo?.[0];
    const decodedLocation =
      typeof keyword.location === "string"
        ? decodeIfEncoded(keyword.location)
        : keyword.location;
    const { city, state } = parseLocation(decodedLocation, keyword.country);
    const decodePart = (part?: string) =>
      typeof part === "string" ? decodeIfEncoded(part) : undefined;
    const locationParts = [decodePart(city), decodePart(state)]
      .filter((v): v is string => Boolean(v));
    if (locationParts.length && countryName) {
      locationParts.push(countryName);
    }
    const params = new URLSearchParams();
    params.set("q", decodeIfEncoded(keyword.keyword));
    if (locationParts.length) {
      params.set("location", locationParts.join(","));
    }
    params.set("gl", gl);
    params.set("hl", lang);
    params.set("apiKey", settings.scraping_api ?? "");
    return `https://google.serper.dev/search?${params.toString()}`;
  },
  resultObjectKey: "organic",
  serpExtractor: ({ result, response }) => {
    const extractedResult = [];
    const typedResponse = response as SerperResponse | undefined;
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
    } else if (Array.isArray(typedResponse?.organic)) {
      results = typedResponse?.organic ?? [];
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
