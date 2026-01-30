import type { NextApiResponse } from 'next';

/**
 * Creates a mock NextApiResponse object for testing API handlers.
 * @returns A mock response object with chainable methods
 */
export const createMockResponse = (): NextApiResponse => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
  send: jest.fn(),
  setHeader: jest.fn().mockReturnThis(),
  end: jest.fn(),
} as unknown as NextApiResponse);
