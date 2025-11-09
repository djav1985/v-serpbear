import exportCSV from '../../../utils/client/exportcsv';

describe('exportCSV', () => {
   const OriginalBlob = global.Blob;
   const blobParts: unknown[][] = [];

   beforeEach(() => {
      blobParts.length = 0;
      // @ts-expect-error - Mock Blob for capturing CSV content
      global.Blob = class MockBlob {
         public parts: unknown[];
         constructor(parts: unknown[], _options?: unknown) {
            this.parts = parts;
            blobParts.push(parts);
         }
      };
      jest.spyOn(URL, 'createObjectURL').mockReturnValue('mock-url');
   });

   afterEach(() => {
      jest.restoreAllMocks();
      global.Blob = OriginalBlob;
   });

   it('falls back to the raw country code when the Search Console country is unknown', () => {
      const keywords: SCKeywordType[] = [
         {
            keyword: 'example keyword',
            uid: 'abc123',
            device: 'desktop',
            page: '/example',
            country: 'ZZ',
            clicks: 5,
            impressions: 50,
            ctr: 0.1,
            position: 3,
         },
      ];

      expect(() => exportCSV(keywords, 'example.com')).not.toThrow();
      expect(blobParts).toHaveLength(1);
      const csvContent = String(blobParts[0][0]);
      expect(csvContent).toMatch(/,"ZZ",/);
   });
});
