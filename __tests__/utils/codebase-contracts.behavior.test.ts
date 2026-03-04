import fs from 'fs';
import path from 'path';
import allScrapers from '../../scrapers/index';
import { computeMapPackTop3 } from '../../utils/mapPack';

describe('Breakpoint Consistency', () => {
   const EXPECTED_MOBILE_BREAKPOINT = '767px';

   it('should use consistent mobile breakpoint across hooks and CSS', () => {
      const hookPath = path.join(process.cwd(), 'hooks', 'useIsMobile.tsx');
      const cssPath = path.join(process.cwd(), 'styles', 'globals.css');

      const hookContent = fs.readFileSync(hookPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      const hookBreakpoints = hookContent.match(/max-width:\s*(\d+px)/g) || [];
      const cssBreakpoints = cssContent.match(/max-width:\s*(\d+px)/g) || [];

      hookBreakpoints.forEach(breakpoint => {
         expect(breakpoint).toContain(EXPECTED_MOBILE_BREAKPOINT);
      });

      cssBreakpoints.forEach(breakpoint => {
         const pixelValue = breakpoint.match(/(\d+)px/)?.[1];
         if (pixelValue && parseInt(pixelValue) < 800) {
            expect(breakpoint).toContain(EXPECTED_MOBILE_BREAKPOINT);
         }
      });
   });

   it('should not contain any legacy 760px breakpoints', () => {
      const hookPath = path.join(process.cwd(), 'hooks', 'useIsMobile.tsx');
      const cssPath = path.join(process.cwd(), 'styles', 'globals.css');

      const hookContent = fs.readFileSync(hookPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      expect(hookContent).not.toContain('760px');
      expect(cssContent).not.toMatch(/max-width:\s*760px/);
   });
});

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

    console.log('Scrapers with map pack support:', withSupport.map((s) => s.id).join(', '));
    console.log('Scrapers without map pack support:', withoutSupport.map((s) => s.id).join(', '));

    expect(withSupport.length).toBeGreaterThan(0);
    expect(withoutSupport.length).toBeGreaterThan(0);
  });

  it('verifies scrapers with supportsMapPack: true call computeMapPackTop3 in their serpExtractor', () => {
    const scrapersWithSupport = allScrapers.filter((s) => s.supportsMapPack === true && s.serpExtractor);

    expect(scrapersWithSupport.length).toBeGreaterThan(0);

    scrapersWithSupport.forEach((scraper) => {
      const extractorCode = scraper.serpExtractor?.toString() || '';
      const hasMapPackLogic = extractorCode.includes('mapPackTop3') || extractorCode.includes('computeMapPackTop3');
      expect(hasMapPackLogic).toBe(true);
    });
  });

  it('verifies scrapers with supportsMapPack: false do not return mapPackTop3', () => {
    const scrapersWithoutSupport = allScrapers.filter((s) => s.supportsMapPack === false && s.serpExtractor);

    if (scrapersWithoutSupport.length === 0) {
      return;
    }

    scrapersWithoutSupport.forEach((scraper) => {
      const extractorCode = scraper.serpExtractor?.toString() || '';
      const returnsMapPack = extractorCode.includes('mapPackTop3:');

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

  it('computeMapPackTop3 matches by business name when no URL is present', () => {
    const response = {
      local_results: [
        { title: 'My Business', position: 1 },
        { title: 'Other Business', position: 2 },
      ],
    };

    const result = computeMapPackTop3('example.com', response, 'My Business');
    expect(result).toBe(true);
  });

  it('computeMapPackTop3 matches by business name when URL exists but does not match', () => {
    const response = {
      local_results: [
        { title: 'My Business', website: 'https://google.com/maps/some-place', position: 1 },
        { title: 'Other Business', website: 'https://other.com', position: 2 },
      ],
    };

    const result = computeMapPackTop3('example.com', response, 'My Business');
    expect(result).toBe(true);
  });

  it('computeMapPackTop3 is case-insensitive for business name matching', () => {
    const response = {
      local_results: [
        { title: 'MY BUSINESS', position: 1 },
        { title: 'Other Business', position: 2 },
      ],
    };

    const result = computeMapPackTop3('example.com', response, 'my business');
    expect(result).toBe(true);
  });

  it('computeMapPackTop3 returns false when business name does not match any titles', () => {
    const response = {
      local_results: [
        { title: 'Different Business', position: 1 },
        { title: 'Another Business', position: 2 },
      ],
    };

    const result = computeMapPackTop3('example.com', response, 'My Business');
    expect(result).toBe(false);
  });

  it('computeMapPackTop3 prefers URL matching over business name matching', () => {
    const response = {
      local_results: [
        { title: 'Different Name', website: 'https://example.com', position: 1 },
        { title: 'My Business', position: 2 },
      ],
    };

    const result = computeMapPackTop3('example.com', response, 'My Business');
    expect(result).toBe(true);
  });

  it('computeMapPackTop3 handles trimmed business names correctly', () => {
    const response = {
      local_results: [
        { title: 'My Business', position: 1 },
      ],
    };

    const result = computeMapPackTop3('example.com', response, '  My Business  ');
    expect(result).toBe(true);
  });

  it('computeMapPackTop3 returns false when business name is only whitespace', () => {
    const response = {
      local_results: [
        { title: 'Some Business', position: 1 },
      ],
    };

    const result = computeMapPackTop3('example.com', response, '   ');
    expect(result).toBe(false);
  });

  it('computeMapPackTop3 returns false when business name is null', () => {
    const response = {
      local_results: [
        { title: 'Some Business', position: 1 },
      ],
    };

    const result = computeMapPackTop3('example.com', response, null);
    expect(result).toBe(false);
  });
});
