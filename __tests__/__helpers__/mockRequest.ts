import type { NextApiRequest } from 'next';

/**
 * Creates a mock NextApiRequest object for testing API handlers.
 * @param overrides - Optional properties to override defaults
 * @returns A mock request object
 */
export const createMockRequest = (overrides: Partial<NextApiRequest> = {}): NextApiRequest => ({
  method: 'GET',
  query: {},
  body: {},
  headers: {},
  ...overrides,
} as unknown as NextApiRequest);
