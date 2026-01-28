import countries, { getGoogleDomain } from "../../utils/countries";
import { resolveCountryCode } from "../../utils/scraperHelpers";
import { parseLocation } from "../../utils/location";
import { computeMapPackTop3 } from "../../utils/mapPack";
import { DEVICE_DESKTOP } from "../../utils/constants";

const decodeIfEncoded = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};

interface HasDataResult {
  title: string;
  link: string;
  position: number;
}

type HasDataResponse = {
  organicResults?: HasDataResult[];
};

const hasdata: ScraperSettings = {
  id: "hasdata",
  name: "HasData",
  website: "hasdata.com",
  allowsCity: true,
  headers: (keyword: KeywordType, settings: SettingsType) => ({
    // use global types
    "Content-Type": "application/json",
    "x-api-key": settings.scraping_api,
  }),
  scrapeURL: (
    keyword: KeywordType,
    settings: SettingsType,
    countryData: any
  ) => {
    // use global types
    const resolvedCountry = resolveCountryCode(keyword.country);
    const country = resolvedCountry;
    const countryInfo = countries[country] ?? countries.US;
    const countryName = countryInfo?.[0] ?? countries.US[0];
    const decodedLocation =
      typeof keyword.location === "string"
        ? decodeIfEncoded(keyword.location)
        : keyword.location;
    const { city, state } = parseLocation(decodedLocation, keyword.country);
    const decodePart = (part?: string) =>
      typeof part === "string" ? decodeIfEncoded(part) : undefined;
    const locationParts = [decodePart(city), decodePart(state)]
      .filter((part): part is string => Boolean(part));
    if (locationParts.length && countryName) {
      locationParts.push(countryName);
    }
    const localeInfo =
      countryData?.[country] ??
      countryData?.US ??
      Object.values(countryData ?? {})[0];
    const lang = localeInfo?.[2] ?? "en";
    const googleDomain = getGoogleDomain(country);
    const params = new URLSearchParams();
    params.set("q", decodeIfEncoded(keyword.keyword));
    params.set("gl", resolvedCountry.toLowerCase());
    params.set("hl", lang);
    params.set("deviceType", keyword.device || DEVICE_DESKTOP);
    params.set("domain", googleDomain);
    if (locationParts.length) {
      params.set("location", locationParts.join(","));
    }
    return `https://api.hasdata.com/scrape/google/serp?${params.toString()}`;
  },
  resultObjectKey: "organicResults",
  supportsMapPack: true,
  serpExtractor: ({ result, response, keyword, settings }) => {
    const extractedResult = [];
    const typedResponse = response as HasDataResponse | undefined;
    let results: HasDataResult[] = [];
    if (typeof result === "string") {
      try {
        results = JSON.parse(result) as HasDataResult[];
      } catch (error) {
        throw new Error(
          `Invalid JSON response for HasData: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    } else if (Array.isArray(result)) {
      results = result as HasDataResult[];
    } else if (Array.isArray(typedResponse?.organicResults)) {
      results = typedResponse?.organicResults ?? [];
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

    const businessName = settings?.business_name ?? null;
    const mapPackTop3 = computeMapPackTop3(keyword.domain, response, businessName);

    return { organic: extractedResult, mapPackTop3 };
  },
};

export default hasdata;
