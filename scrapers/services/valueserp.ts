import countries from "../../utils/countries";
import { resolveCountryCode } from "../../utils/scraperHelpers";
import { parseLocation } from "../../utils/location";
import { computeMapPackTop3 } from "../../utils/mapPack";
import { getGoogleDomain } from "../../utils/googleDomains";

const decodeIfEncoded = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};

interface ValueSerpResult {
  title: string;
  link: string;
  position: number;
  domain: string;
}

const valueSerp: ScraperSettings = {
  id: "valueserp",
  name: "Value Serp",
  website: "valueserp.com",
  allowsCity: true,
  timeoutMs: 35000, // ValueSerp responses often take longer, allow 35 seconds
  scrapeURL: (
    keyword: KeywordType,
    settings: SettingsType,
    countryData: any
  ) => {
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
      countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
    const lang = localeInfo?.[2] ?? "en";
    const googleDomain = getGoogleDomain(country);
    const params = new URLSearchParams();
    // Set params in required order
    params.set("api_key", settings.scraping_api ?? "");
    params.set("q", decodeIfEncoded(keyword.keyword));
    params.set("output", "json");
    params.set("include_answer_box", "false");
    params.set("include_advertiser_info", "false");
    if (locationParts.length) {
      params.set("location", locationParts.join(","));
    }
    if (keyword.device === "mobile") {
      params.set("device", "mobile");
    }
    params.set("gl", resolvedCountry.toLowerCase());
    params.set("hl", lang);
    params.set("google_domain", googleDomain);
    return `https://api.valueserp.com/search?${params.toString()}`;
  },
  resultObjectKey: "organic_results",
  supportsMapPack: true,
  serpExtractor: ({ result, response, keyword, settings }) => {
    const extractedResult = [];
    let results: ValueSerpResult[] = [];
    if (typeof result === "string") {
      try {
        results = JSON.parse(result) as ValueSerpResult[];
      } catch (error) {
        throw new Error(
          `Invalid JSON response for Value Serp: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    } else if (Array.isArray(result)) {
      results = result as ValueSerpResult[];
    } else if (Array.isArray(response?.organic_results)) {
      results = response.organic_results as ValueSerpResult[];
    }
    for (const item of results) {
      if (item?.title && item?.link) {
        extractedResult.push({
          title: item.title,
          url: item.link,
          position: item.position,
        });
      }
    }

    const businessName = (settings as any)?.business_name ?? null;
    
    // Check if this is a mobile keyword and if the API response has NO local results section at all
    const isMobile = keyword.device === 'mobile';
    const hasLocalResultsSection = response && (
      response.local_results !== undefined ||
      response.localResults !== undefined ||
      response.local_map !== undefined ||
      response.places !== undefined ||
      response.places_results !== undefined
    );
    
    let mapPackTop3: boolean;
    
    // If mobile AND no local results section in API response, use fallback from desktop
    if (isMobile && !hasLocalResultsSection && (settings as any)?.fallback_mapPackTop3 !== undefined) {
      mapPackTop3 = (settings as any).fallback_mapPackTop3;
      console.log(`[VALUESERP] Mobile keyword "${keyword.keyword}" has no local results in API response, using desktop mapPackTop3: ${mapPackTop3}`);
    } else {
      // Otherwise compute normally
      mapPackTop3 = computeMapPackTop3(keyword.domain, response, businessName);
    }

    return { organic: extractedResult, mapPackTop3 };
  },
};

export default valueSerp;
