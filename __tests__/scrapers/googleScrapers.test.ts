import scrapingAnt from '../../scrapers/services/scrapingant';
import searchapi from '../../scrapers/services/searchapi';
import serpapi from '../../scrapers/services/serpapi';
import hasdata from '../../scrapers/services/hasdata';
import spaceSerp from '../../scrapers/services/spaceserp';
import proxy from '../../scrapers/services/proxy';

const countryData = {
  US: ['United States', 'Washington, D.C.', 'en', 2840],
  BR: ['Brazil', 'Brasilia', 'pt', 2064],
} as any;

const keywordBase = {
  keyword: 'best coffee beans',
  country: 'US',
  device: 'desktop',
} as Partial<KeywordType>;

const settings = { scraping_api: 'token-123' } as Partial<SettingsType>;

describe('Google powered scrapers', () => {
  it('scrapingAnt encodes Google locale details in the nested URL', () => {
    const keyword = { ...keywordBase, device: 'mobile' } as KeywordType;
    const url = scrapingAnt.scrapeURL(keyword, settings as SettingsType, countryData);
    const apiUrl = new URL(url);

    expect(apiUrl.origin).toBe('https://api.scrapingant.com');
    expect(apiUrl.searchParams.get('proxy_country')).toBe('US');

    const encodedGoogleUrl = apiUrl.searchParams.get('url');
    expect(encodedGoogleUrl).not.toBeNull();

    const decodedGoogleUrl = decodeURIComponent(encodedGoogleUrl!);
    const googleUrl = new URL(decodedGoogleUrl);

    expect(googleUrl.hostname).toBe('google.com');
    expect(googleUrl.searchParams.get('num')).toBe('100');
    expect(googleUrl.searchParams.get('hl')).toBe('en');
    expect(googleUrl.searchParams.get('gl')).toBe('us');
    expect(googleUrl.searchParams.get('q')).toBe(keyword.keyword);
    expect(googleUrl.searchParams.get('device')).toBeNull();
  });

  it('proxy scraper builds a localized Google URL directly', () => {
    const keyword = { ...keywordBase } as KeywordType;
    const url = proxy.scrapeURL(keyword);
    const googleUrl = new URL(url);

    expect(googleUrl.hostname).toBe('google.com');
    expect(googleUrl.searchParams.get('num')).toBe('100');
    expect(googleUrl.searchParams.get('gl')).toBe('us');
    expect(googleUrl.searchParams.get('q')).toBe(keyword.keyword);
  });

  it('SearchApi includes google_domain alongside locale parameters', () => {
    const keyword = {
      ...keywordBase,
      location: 'Miami,FL,US',
    } as KeywordType;

    const url = searchapi.scrapeURL(keyword);
    const parsed = new URL(url);

    expect(parsed.searchParams.get('google_domain')).toBe('google.com');
    expect(parsed.searchParams.get('gl')).toBe('us');
    expect(parsed.searchParams.get('device')).toBe('desktop');
    expect(parsed.searchParams.get('location')).toBe('Miami,FL,United States');
    expect(parsed.searchParams.get('q')).toBe(keyword.keyword);
  });

  it('SerpApi request mirrors the new query string expectations', () => {
    const keyword = {
      ...keywordBase,
      location: 'Miami,FL,US',
    } as KeywordType;

    const url = serpapi.scrapeURL(keyword, settings as SettingsType);
    const parsed = new URL(url);

    expect(parsed.searchParams.get('google_domain')).toBe('google.com');
    expect(parsed.searchParams.get('gl')).toBe('us');
    expect(parsed.searchParams.get('device')).toBe('desktop');
    expect(parsed.searchParams.get('location')).toBe('Miami,FL,United States');
    expect(parsed.searchParams.get('q')).toBe(keyword.keyword);
  });

  it('HasData scraper adds google_domain and lowercases gl', () => {
    const keyword = {
      ...keywordBase,
      location: 'Miami,FL,US',
    } as KeywordType;

    const url = hasdata.scrapeURL(keyword, settings as SettingsType);
    const parsed = new URL(url);

    expect(parsed.searchParams.get('google_domain')).toBe('google.com');
    expect(parsed.searchParams.get('gl')).toBe('us');
    expect(parsed.searchParams.get('deviceType')).toBe('desktop');
    expect(parsed.searchParams.get('location')).toBe('Miami,FL,United States');
    expect(parsed.searchParams.get('q')).toBe(keyword.keyword);
  });

  it('SpaceSerp request reflects device and google_domain handling', () => {
    const keyword = {
      ...keywordBase,
      device: 'mobile',
      location: 'Miami,FL,US',
    } as KeywordType;

    const url = spaceSerp.scrapeURL!(keyword, settings as SettingsType, countryData);
    const parsed = new URL(url);

    expect(parsed.searchParams.get('google_domain')).toBe('google.com');
    expect(parsed.searchParams.get('gl')).toBe('us');
    expect(parsed.searchParams.get('device')).toBe('mobile');
    expect(parsed.searchParams.get('location')).toBe('Miami,FL,United States');
    expect(parsed.searchParams.get('q')).toBe(keyword.keyword);
  });
});
