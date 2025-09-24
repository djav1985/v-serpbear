import Keyword from '../../app/database/models/keyword';

// Mock dependencies
jest.mock('../../app/database/models/keyword');

describe('Adwords Seed Functions', () => {
  const mockKeywords = [
    { 
      get: () => ({ 
        ID: 1, 
        keyword: 'low volume keyword', 
        volume: 50, 
        domain: 'example.com' 
      }) 
    },
    { 
      get: () => ({ 
        ID: 2, 
        keyword: 'high volume keyword', 
        volume: 1000, 
        domain: 'example.com' 
      }) 
    },
    { 
      get: () => ({ 
        ID: 3, 
        keyword: 'medium volume keyword', 
        volume: 300, 
        domain: 'example.com' 
      }) 
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('seedKeywordsFromTracking improvements', () => {
    // Import the function after mocks are set up
    const getFunction = async () => {
      const adwordsModule = await import('../../app/utils/adwords');
      // Access the function through the module's internal structure
      // Since it's not exported, we'll test it through integration
      return adwordsModule.getAdwordsKeywordIdeas;
    };

    it('should order keywords by volume descending when using tracking seed type', async () => {
      // Mock Keyword.findAll to return unordered keywords
      const mockFindAll = jest.spyOn(Keyword, 'findAll').mockResolvedValue(mockKeywords as any);
      
      const adwordsFunction = await getFunction();
      
      // Mock the credentials and other dependencies
      const mockCredentials = {
        client_id: 'test',
        client_secret: 'test',
        developer_token: 'test',
        account_id: '123-456-7890',
        refresh_token: 'test',
      };

      // Mock fetch to return access token and then empty results
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'test-token' }),
          text: async () => JSON.stringify({ access_token: 'test-token' }),
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
        })
        .mockResolvedValueOnce({
          json: async () => ({ results: [] }),
          text: async () => JSON.stringify({ results: [] }),
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
        });

      try {
        await adwordsFunction(
          mockCredentials,
          { 
            country: 'US', 
            language: '1000', 
            domainUrl: 'example.com', 
            seedType: 'tracking' 
          },
          true,
        );
      } catch (error) {
        // We expect it to potentially throw since we're mocking minimal responses
        // The important part is that findAll was called with the correct order
      }

      // Verify that findAll was called with ORDER BY volume DESC
      expect(mockFindAll).toHaveBeenCalledWith({
        where: { domain: 'example.com' },
        order: [['volume', 'DESC']],
      });
    });

    it('should handle empty keywords gracefully with Set-based approach', async () => {
      // Mock Keyword.findAll to return empty array
      const mockFindAll = jest.spyOn(Keyword, 'findAll').mockResolvedValue([]);
      
      const adwordsFunction = await getFunction();
      
      const mockCredentials = {
        client_id: 'test',
        client_secret: 'test',
        developer_token: 'test',
        account_id: '123-456-7890',
        refresh_token: 'test',
      };

      // Mock fetch responses
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'test-token' }),
          text: async () => JSON.stringify({ access_token: 'test-token' }),
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
        });

      // Should throw error when no tracked keywords found
      await expect(
        adwordsFunction(
          mockCredentials,
          { 
            country: 'US', 
            language: '1000', 
            domainUrl: 'example.com', 
            seedType: 'tracking' 
          },
          true,
        )
      ).rejects.toThrow('No tracked keywords found for this domain');

      // Verify that findAll was still called with correct parameters
      expect(mockFindAll).toHaveBeenCalledWith({
        where: { domain: 'example.com' },
        order: [['volume', 'DESC']],
      });
    });
  });
});