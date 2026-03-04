import { scrapeKeywordFromGoogle } from '../../utils/scraper';

const originalFetch = global.fetch;

describe('scraper error handling', () => {
  beforeAll(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console.log mock
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts status code from request_info.status_code when res.status is missing', async () => {
    const mockResponse = {
      request_info: {
        success: false,
        status_code: 429,
        message: 'Rate limit exceeded',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => mockResponse,
    });

    const keyword: Partial<KeywordType> = {
      ID: 1,
      keyword: 'test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      position: 0,
      url: '',
      lastResult: [],
      mapPackTop3: false,
    };

    const settings: Partial<SettingsType> = {
      scraper_type: 'valueserp',
      scraping_api: 'test-key',
    };

    const result = await scrapeKeywordFromGoogle(
      keyword as KeywordType,
      settings as SettingsType,
      0
    );

    // Should capture the error with the correct status code
    if (!result) throw new Error('Expected a scrape result');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('429');
  });

  it('includes request_info.message in error when other error fields are missing', async () => {
    const mockResponse = {
      request_info: {
        success: false,
        status_code: 503,
        message: 'VALUE SERP was unable to fulfil your request at this time, please retry...',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => mockResponse,
    });

    const keyword: Partial<KeywordType> = {
      ID: 1,
      keyword: 'test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      position: 0,
      url: '',
      lastResult: [],
      mapPackTop3: false,
    };

    const settings: Partial<SettingsType> = {
      scraper_type: 'valueserp',
      scraping_api: 'test-key',
    };

    const result = await scrapeKeywordFromGoogle(
      keyword as KeywordType,
      settings as SettingsType,
      0
    );

    // Should capture both the status code and message
    if (!result) throw new Error('Expected a scrape result');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('503');
    expect(result.error).toContain('VALUE SERP was unable to fulfil your request');
  });

  it('prioritizes request_info.error over request_info.message', async () => {
    const mockResponse = {
      request_info: {
        success: false,
        status_code: 400,
        error: 'Invalid API key',
        message: 'Some other message',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => mockResponse,
    });

    const keyword: Partial<KeywordType> = {
      ID: 1,
      keyword: 'test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      position: 0,
      url: '',
      lastResult: [],
      mapPackTop3: false,
    };

    const settings: Partial<SettingsType> = {
      scraper_type: 'valueserp',
      scraping_api: 'test-key',
    };

    const result = await scrapeKeywordFromGoogle(
      keyword as KeywordType,
      settings as SettingsType,
      0
    );

    // Should use error field over message
    if (!result) throw new Error('Expected a scrape result');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Invalid API key');
    expect(result.error).not.toContain('Some other message');
  });

  it('falls back to "Unknown Status" when no status code is available', async () => {
    const mockResponse = {
      request_info: {
        success: false,
        message: 'Something went wrong',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => mockResponse,
    });

    const keyword: Partial<KeywordType> = {
      ID: 1,
      keyword: 'test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      position: 0,
      url: '',
      lastResult: [],
      mapPackTop3: false,
    };

    const settings: Partial<SettingsType> = {
      scraper_type: 'valueserp',
      scraping_api: 'test-key',
    };

    const result = await scrapeKeywordFromGoogle(
      keyword as KeywordType,
      settings as SettingsType,
      0
    );

    // Should still capture the error with Unknown Status
    if (!result) throw new Error('Expected a scrape result');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Unknown Status');
    expect(result.error).toContain('Something went wrong');
  });
});
