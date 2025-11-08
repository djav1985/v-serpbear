import allScrapers from '../../scrapers/index';
import { computeMapPackTop3 } from '../../utils/mapPack';

describe('Map Pack Support Flag Enforcement', () => {
  it('ensures all scrapers have explicit supportsMapPack flag', () => {
    allScrapers.forEach((scraper) => {
      expect(scraper).toHaveProperty('supportsMapPack');
      expect(typeof scraper.supportsMapPack).toBe('boolean');
    });
  });

  it('lists scrapers by map pack support status', () => {
    const withSupport = allScrapers.filter((s) => s.supportsMapPack === true);
    const withoutSupport = allScrapers.filter((s) => s.supportsMapPack === false);

    // Log for documentation purposes
    console.log('Scrapers with map pack support:', withSupport.map((s) => s.id).join(', '));
    console.log('Scrapers without map pack support:', withoutSupport.map((s) => s.id).join(', '));

    // Verify at least some scrapers support it
    expect(withSupport.length).toBeGreaterThan(0);
    expect(withoutSupport.length).toBeGreaterThan(0);
  });

  it('verifies scrapers with supportsMapPack: true call computeMapPackTop3 in their serpExtractor', () => {
    const scrapersWithSupport = allScrapers.filter((s) => s.supportsMapPack === true && s.serpExtractor);
    
    expect(scrapersWithSupport.length).toBeGreaterThan(0);
    
    // This is a code structure test - we verify that supported scrapers have the pattern
    scrapersWithSupport.forEach((scraper) => {
      const extractorCode = scraper.serpExtractor?.toString() || '';
      // Check if the extractor mentions mapPackTop3 or computeMapPackTop3
      const hasMapPackLogic = extractorCode.includes('mapPackTop3') || extractorCode.includes('computeMapPackTop3');
      expect(hasMapPackLogic).toBe(true);
    });
  });

  it('verifies scrapers with supportsMapPack: false do not return mapPackTop3', () => {
    const scrapersWithoutSupport = allScrapers.filter((s) => s.supportsMapPack === false && s.serpExtractor);
    
    if (scrapersWithoutSupport.length === 0) {
      // All scrapers without support rely on HTML parsing, which is fine
      return;
    }
    
    // Verify they don't try to extract map pack data
    scrapersWithoutSupport.forEach((scraper) => {
      const extractorCode = scraper.serpExtractor?.toString() || '';
      const returnsMapPack = extractorCode.includes('mapPackTop3:');
      
      // If they do return mapPackTop3, it should be hardcoded to false or undefined
      if (returnsMapPack) {
        const returnsFalse = extractorCode.includes('mapPackTop3: false');
        const returnsUndefined = !extractorCode.match(/mapPackTop3:\s*(?!false)/);
        expect(returnsFalse || returnsUndefined).toBe(true);
      }
    });
  });

  it('computeMapPackTop3 returns false when no local results present', () => {
    const response = {
      organic_results: [
        { title: 'Result 1', link: 'https://example.com/1', position: 1 },
      ],
    };

    const result = computeMapPackTop3('example.com', response);
    expect(result).toBe(false);
  });

  it('computeMapPackTop3 returns true when domain is in top 3 local results', () => {
    const response = {
      local_results: [
        { title: 'Business 1', website: 'https://example.com', position: 1 },
        { title: 'Business 2', website: 'https://other.com', position: 2 },
      ],
    };

    const result = computeMapPackTop3('example.com', response);
    expect(result).toBe(true);
  });

  it('computeMapPackTop3 returns false when domain is not in top 3 local results', () => {
    const response = {
      local_results: [
        { title: 'Business 1', website: 'https://other1.com', position: 1 },
        { title: 'Business 2', website: 'https://other2.com', position: 2 },
        { title: 'Business 3', website: 'https://other3.com', position: 3 },
      ],
    };

    const result = computeMapPackTop3('example.com', response);
    expect(result).toBe(false);
  });
});
