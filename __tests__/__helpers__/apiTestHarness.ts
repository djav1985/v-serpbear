/**
 * API route test harness helpers.
 *
 * Centralises the most frequently duplicated assertions across API route test
 * files so that each suite only needs to state the behaviour that is unique to
 * that route.
 *
 * Usage:
 *
 * ```ts
 * import {
 *   assertUnauthorized,
 *   assertMethodNotAllowed,
 *   assertErrorShape,
 * } from '../__helpers__/apiTestHarness';
 *
 * it('returns 401 when not authorised', async () => {
 *   verifyUserMock.mockReturnValue('not authorized');
 *   await assertUnauthorized(handler, createMockRequest({ method: 'GET' }));
 * });
 * ```
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createMockResponse } from './mockResponse';

type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void;

/**
 * Calls `handler` with the given request and a fresh mock response, then
 * asserts that the response status is 401.
 */
export async function assertUnauthorized(
  handler: ApiHandler,
  req: NextApiRequest,
): Promise<void> {
  const res = createMockResponse();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
}

/**
 * Calls `handler` with the given request and a fresh mock response, then
 * asserts that the response status is 405 and the error payload contains a
 * `METHOD_NOT_ALLOWED` code.
 */
export async function assertMethodNotAllowed(
  handler: ApiHandler,
  req: NextApiRequest,
): Promise<void> {
  const res = createMockResponse();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(405);
  const payload = (res.json as jest.Mock).mock.calls[0]?.[0];
  if (payload) {
    expect(payload).toMatchObject({
      error: expect.objectContaining({ code: 'METHOD_NOT_ALLOWED' }),
    });
  }
}

/**
 * Asserts that `body` conforms to the standard `{ error: { code, message } }`
 * error envelope shape.  Pass `expectedCode` to also verify the specific code.
 */
export function assertErrorShape(
  body: unknown,
  expectedCode?: string,
): void {
  expect(body).toMatchObject({
    error: expect.objectContaining({ message: expect.any(String) }),
  });
  if (expectedCode) {
    expect((body as any).error.code).toBe(expectedCode);
  }
}

/**
 * Convenience wrapper: calls `handler`, asserts status 400, and optionally
 * checks the error code in the response body.
 */
export async function assertBadRequest(
  handler: ApiHandler,
  req: NextApiRequest,
  expectedCode?: string,
): Promise<void> {
  const res = createMockResponse();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  const payload = (res.json as jest.Mock).mock.calls[0]?.[0];
  if (payload) {
    assertErrorShape(payload, expectedCode);
  }
}

/**
 * Convenience wrapper: calls `handler`, asserts status 404, and optionally
 * checks the error code in the response body.
 */
export async function assertNotFound(
  handler: ApiHandler,
  req: NextApiRequest,
  expectedCode?: string,
): Promise<void> {
  const res = createMockResponse();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
  const payload = (res.json as jest.Mock).mock.calls[0]?.[0];
  if (payload) {
    assertErrorShape(payload, expectedCode ?? 'NOT_FOUND');
  }
}
