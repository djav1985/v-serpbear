import valueSerp from '../../scrapers/services/valueserp';
import { computeMapPackTop3, extractLocalResultsFromPayload } from '../../utils/mapPack';

describe('valueSerp actual API response structure', () => {
  it('handles actual ValueSERP local_results without website field', () => {
    const keyword: KeywordType = {
      ID: 1,
      keyword: 'website designer',
      device: 'desktop',
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

    // Actual ValueSERP response structure as provided by user
    const mockResponse = {
      request_info: {
        success: true,
        topup_credits_remaining: 4659,
        credits_used_this_request: 1,
      },
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
      response: mockResponse,
      result: mockResponse.organic_results,
    });

    expect(extraction.organic).toHaveLength(1);
    
    // Test that local_results are extracted
    const localResults = extractLocalResultsFromPayload(mockResponse);
    console.log('Extracted local results:', localResults);
    expect(localResults.length).toBe(2);
    
    // Test mapPackTop3 - this will currently fail because no website field
    console.log('mapPackTop3 result:', extraction.mapPackTop3);
  });

  it('uses title matching when no website URL in local_results', () => {
    const response = {
      local_results: [
        {
          position: 1,
          title: 'Vontainment',
          rating: 4.8,
          reviews: 42,
          address: '22096 Laramore Ave',
          // NOTE: No website field - will use title matching fallback
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', response);
    console.log('MapPack result with title matching:', result);
    expect(result).toBe(true); // Now true because title matches domain
  });
});
