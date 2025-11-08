import { computeMapPackTop3 } from '../../utils/mapPack';

describe('ValueSERP nested links structure', () => {
  it('extracts website from nested links object', () => {
    const responseWithNestedLinks = {
      local_results: [
        {
          position: 1,
          title: 'Vontainment',
          rating: 4.8,
          links: {
            website: 'https://vontainment.com',
          },
        },
        {
          position: 2,
          title: 'Other Business',
          rating: 4.5,
          links: {
            website: 'https://other.com',
          },
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', responseWithNestedLinks);
    expect(result).toBe(true);
  });

  it('extracts website from nested gps_coordinates object', () => {
    const responseWithGpsLinks = {
      local_results: [
        {
          position: 1,
          title: 'Vontainment',
          gps_coordinates: {
            website: 'https://vontainment.com',
          },
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', responseWithGpsLinks);
    expect(result).toBe(true);
  });

  it('handles direct website field (backward compatibility)', () => {
    const responseWithDirectWebsite = {
      local_results: [
        {
          position: 1,
          title: 'Vontainment',
          website: 'https://vontainment.com',
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', responseWithDirectWebsite);
    expect(result).toBe(true);
  });

  it('uses title matching fallback when no website URL available', () => {
    const responseWithoutWebsite = {
      local_results: [
        {
          position: 1,
          title: 'Vontainment',
          rating: 4.8,
          address: '22096 Laramore Ave',
          // No website field anywhere - will use title matching
        },
      ],
    };

    const result = computeMapPackTop3('vontainment.com', responseWithoutWebsite);
    expect(result).toBe(true); // Now true because title matches domain
  });
});
