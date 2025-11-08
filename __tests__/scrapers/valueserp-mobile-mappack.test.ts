import valueSerp from '../../scrapers/services/valueserp';

describe('valueSerp mobile map pack detection', () => {
  it('detects map pack for mobile keyword with local_results', () => {
    const keyword: KeywordType = {
      ID: 1,
      keyword: 'pizza restaurant',
      device: 'mobile',
      country: 'US',
      domain: 'example.com',
      lastUpdated: '',
      volume: 0,
      added: '',
      position: 0,
      sticky: false,
      history: {},
      lastResult: [],
      url: '',
      tags: [],
      updating: false,
      lastUpdateError: false,
      mapPackTop3: false,
      location: 'Austin,TX,US',
    };

    const mockMobileResponse = {
      organic_results: [
        { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
        { title: 'Result 2', link: 'https://other.com/page2', position: 2 },
      ],
      local_results: [
        { title: 'Pizza Place 1', website: 'https://example.com', position: 1 },
        { title: 'Pizza Place 2', website: 'https://competitor.com', position: 2 },
        { title: 'Pizza Place 3', website: 'https://another.com', position: 3 },
      ],
    };

    const extraction = valueSerp.serpExtractor!({
      keyword,
      response: mockMobileResponse,
      result: mockMobileResponse.organic_results,
    });

    expect(extraction.organic).toHaveLength(2);
    expect(extraction.mapPackTop3).toBe(true);
  });

  it('detects map pack for mobile keyword with local_map field', () => {
    const keyword: KeywordType = {
      ID: 1,
      keyword: 'pizza restaurant',
      device: 'mobile',
      country: 'US',
      domain: 'example.com',
      lastUpdated: '',
      volume: 0,
      added: '',
      position: 0,
      sticky: false,
      history: {},
      lastResult: [],
      url: '',
      tags: [],
      updating: false,
      lastUpdateError: false,
      mapPackTop3: false,
      location: 'Austin,TX,US',
    };

    const mockMobileResponse = {
      organic_results: [
        { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
      ],
      local_map: {
        places: [
          { title: 'Pizza Place 1', website: 'https://example.com', position: 1 },
          { title: 'Pizza Place 2', website: 'https://competitor.com', position: 2 },
        ],
      },
    };

    const extraction = valueSerp.serpExtractor!({
      keyword,
      response: mockMobileResponse,
      result: mockMobileResponse.organic_results,
    });

    expect(extraction.organic).toHaveLength(1);
    expect(extraction.mapPackTop3).toBe(true);
  });

  it('detects map pack for mobile keyword with places field', () => {
    const keyword: KeywordType = {
      ID: 1,
      keyword: 'pizza restaurant',
      device: 'mobile',
      country: 'US',
      domain: 'example.com',
      lastUpdated: '',
      volume: 0,
      added: '',
      position: 0,
      sticky: false,
      history: {},
      lastResult: [],
      url: '',
      tags: [],
      updating: false,
      lastUpdateError: false,
      mapPackTop3: false,
      location: 'Austin,TX,US',
    };

    const mockMobileResponse = {
      organic_results: [
        { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
      ],
      places: [
        { title: 'Pizza Place 1', website: 'https://example.com', position: 1 },
        { title: 'Pizza Place 2', website: 'https://competitor.com', position: 2 },
      ],
    };

    const extraction = valueSerp.serpExtractor!({
      keyword,
      response: mockMobileResponse,
      result: mockMobileResponse.organic_results,
    });

    expect(extraction.organic).toHaveLength(1);
    expect(extraction.mapPackTop3).toBe(true);
  });
});
