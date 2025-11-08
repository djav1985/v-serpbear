import valueSerp from '../../scrapers/services/valueserp';
import { computeMapPackTop3 } from '../../utils/mapPack';

describe('ValueSERP mobile vs desktop local_results', () => {
  it('detects mappack in desktop response with link field', () => {
    const desktopResponse = {
      organic_results: [
        { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
      ],
      local_results: [
        {
          position: 1,
          title: 'Vontainment',
          gps_coordinates: {
            latitude: 27.00123,
            longitude: -82.08756,
          },
          link: 'https://vontainment.com/?utm_source=google&utm_medium=gmb',
          snippet: 'Vontainment did an awesome job on our website!',
          address: '22096 Laramore Ave',
          business_type: 'Website designer',
          data_cid: '3894416130087266959',
          rating: 4.8,
          reviews: 42,
          block_position: 5,
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', desktopResponse);
    expect(result).toBe(true);
  });

  it('detects mappack in mobile response WITHOUT link field using title matching', () => {
    const mobileResponse = {
      organic_results: [
        { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
      ],
      local_results: [
        {
          position: 1,
          title: 'Vontainment',
          rating: 4.8,
          reviews: 42,
          address: '22096 Laramore Ave',
          business_type: 'Website designer',
          sponsored: false,
          block_position: 2,
          // NOTE: No link field in mobile!
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', mobileResponse);
    expect(result).toBe(true);
  });

  it('works with valueSerp serpExtractor for mobile response', () => {
    const keyword: KeywordType = {
      ID: 1,
      keyword: 'website designer',
      device: 'mobile',
      country: 'US',
      domain: 'vontainment.com',
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

    const mobileResponse = {
      organic_results: [
        { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
      ],
      local_results: [
        {
          position: 1,
          title: 'Vontainment',
          rating: 4.8,
          reviews: 42,
          address: '22096 Laramore Ave',
          business_type: 'Website designer',
          sponsored: false,
          block_position: 2,
        },
        {
          position: 2,
          title: 'Other Designer',
          rating: 4.5,
          reviews: 30,
          address: '123 Main St',
          business_type: 'Website designer',
          sponsored: false,
          block_position: 3,
        },
      ],
    };

    const extraction = valueSerp.serpExtractor!({
      keyword,
      response: mobileResponse,
      result: mobileResponse.organic_results,
    });

    expect(extraction.organic).toHaveLength(1);
    expect(extraction.mapPackTop3).toBe(true);
  });

  it('returns false when title does not match domain', () => {
    const mobileResponse = {
      local_results: [
        {
          position: 1,
          title: 'Competitor Business',
          rating: 4.8,
          reviews: 42,
          // No link, and title doesn't match vontainment
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', mobileResponse);
    expect(result).toBe(false);
  });

  it('handles case-insensitive title matching', () => {
    const mobileResponse = {
      local_results: [
        {
          position: 1,
          title: 'VONTAINMENT',
          rating: 4.8,
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', mobileResponse);
    expect(result).toBe(true);
  });

  it('matches partial domain names in titles', () => {
    const mobileResponse = {
      local_results: [
        {
          position: 1,
          title: 'Vontainment Web Design',
          rating: 4.8,
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', mobileResponse);
    expect(result).toBe(true);
  });
});
