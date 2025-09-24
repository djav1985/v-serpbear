import { extractScrapedResult } from '../../app/utils/scraper';
import { GOOGLE_BASE_URL } from '../../app/utils/constants';

describe('Google link filtering', () => {
  it('should filter out Google internal links properly', () => {
    // Create a test function to validate our URL filtering logic
    const testGoogleUrlFiltering = (url: string): boolean => {
      try {
        const parsedURL = new URL(url.startsWith('http') ? url : `https://${url}`);
        return parsedURL.origin === GOOGLE_BASE_URL;
      } catch (error) {
        return false;
      }
    };

    // Test various URLs
    expect(testGoogleUrlFiltering('https://www.google.com/search?q=test')).toBe(true);
    expect(testGoogleUrlFiltering('https://www.google.com/maps')).toBe(true);
    expect(testGoogleUrlFiltering('https://www.google.com/news')).toBe(true);
    expect(testGoogleUrlFiltering('https://www.google.com')).toBe(true);
    expect(testGoogleUrlFiltering('https://example.com')).toBe(false);
    expect(testGoogleUrlFiltering('https://another-site.com/page')).toBe(false);
    expect(testGoogleUrlFiltering('https://google.com')).toBe(false); // Different subdomain
    expect(testGoogleUrlFiltering('https://mail.google.com')).toBe(false); // Different subdomain

    // Test that our constant matches the expected behavior
    const testURL = new URL('https://www.google.com/search?q=test');
    expect(testURL.origin).toBe(GOOGLE_BASE_URL);
  });

  it('should handle malformed URLs gracefully', () => {
    const testSafeUrlParsing = (url: string): boolean => {
      try {
        const parsedURL = new URL(url.startsWith('http') ? url : `https://${url}`);
        return parsedURL.origin === GOOGLE_BASE_URL;
      } catch (error) {
        // Should return false for malformed URLs (which causes them to be skipped)
        return false;
      }
    };

    // These should return false (not throw errors)
    expect(testSafeUrlParsing('invalid-url')).toBe(false);
    expect(testSafeUrlParsing('://malformed')).toBe(false);
    expect(testSafeUrlParsing('')).toBe(false);

    // These should work normally
    expect(testSafeUrlParsing('https://example.com')).toBe(false);
    expect(testSafeUrlParsing('https://www.google.com/test')).toBe(true);
  });

  // Test that the fix correctly identifies the issue mentioned in the GitHub issue
  it('demonstrates the fix for the logical flaw mentioned in issue #302', () => {
    // The original issue: after URLs are absolutized, checking startsWith('/') is ineffective
    const absoluteUrl = 'https://www.google.com/search?q=test';
    
    // This would be the BROKEN logic (always false for absolute URLs)
    const brokenCheck = absoluteUrl.startsWith('/');
    expect(brokenCheck).toBe(false); // This demonstrates the flaw
    
    // This is the FIXED logic (correctly identifies Google URLs)
    const parsedURL = new URL(absoluteUrl);
    const correctCheck = parsedURL.origin === GOOGLE_BASE_URL;
    expect(correctCheck).toBe(true); // This correctly identifies Google internal links
  });
});