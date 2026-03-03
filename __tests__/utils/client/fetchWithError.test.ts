import { extractErrorMessage, throwOnError } from '../../../utils/client/fetchWithError';

function makeResponse(
   status: number,
   contentType: string | null,
   body: unknown,
): Response {
   const jsonFn = typeof body === 'object' && body !== null
      ? jest.fn().mockResolvedValue(body)
      : jest.fn().mockRejectedValue(new Error('Not JSON'));
   const textFn = typeof body === 'string'
      ? jest.fn().mockResolvedValue(body)
      : jest.fn().mockResolvedValue('');
   return {
      status,
      headers: {
         get: jest.fn().mockReturnValue(contentType),
      },
      json: jsonFn,
      text: textFn,
   } as unknown as Response;
}

describe('extractErrorMessage', () => {
   it('returns the error field from a JSON response', async () => {
      const res = makeResponse(400, 'application/json', { error: 'Invalid payload' });
      await expect(extractErrorMessage(res)).resolves.toBe('Invalid payload');
   });

   it('falls back to status message when JSON has no error field', async () => {
      const res = makeResponse(422, 'application/json', { message: 'unprocessable' });
      await expect(extractErrorMessage(res)).resolves.toBe('Server error (422): Please try again later');
   });

   it('returns status message for non-JSON responses', async () => {
      const res = makeResponse(503, 'text/html', '<html>error</html>');
      (res.json as jest.Mock).mockRejectedValue(new Error('Not JSON'));
      (res.text as jest.Mock).mockResolvedValue('<html>error</html>');
      await expect(extractErrorMessage(res)).resolves.toBe('Server error (503): Please try again later');
   });

   it('returns status message when JSON parsing throws', async () => {
      const res = makeResponse(500, 'application/json', null);
      (res.json as jest.Mock).mockRejectedValue(new Error('parse error'));
      await expect(extractErrorMessage(res)).resolves.toBe('Server error (500): Please try again later');
   });

   it('returns status message when content-type header is null', async () => {
      const res = makeResponse(404, null, '<html>not found</html>');
      (res.text as jest.Mock).mockResolvedValue('<html>not found</html>');
      await expect(extractErrorMessage(res)).resolves.toBe('Server error (404): Please try again later');
   });
});

describe('throwOnError', () => {
   it('does not throw for 2xx responses', async () => {
      const res = makeResponse(200, 'application/json', { ok: true });
      await expect(throwOnError(res)).resolves.toBeUndefined();
   });

   it('throws with the JSON error message on 400', async () => {
      const res = makeResponse(400, 'application/json', { error: 'Bad request' });
      await expect(throwOnError(res)).rejects.toThrow('Bad request');
   });

   it('throws with status message for HTML error responses', async () => {
      const res = makeResponse(500, 'text/html', '<html>error</html>');
      (res.json as jest.Mock).mockRejectedValue(new Error('Not JSON'));
      (res.text as jest.Mock).mockResolvedValue('<html>error</html>');
      await expect(throwOnError(res)).rejects.toThrow('Server error (500): Please try again later');
   });

   it('calls router.push("/login") on 401 and throws', async () => {
      const res = makeResponse(401, 'application/json', { error: 'Unauthorized' });
      const router = { push: jest.fn() };
      await expect(throwOnError(res, router)).rejects.toThrow('Unauthorized');
      expect(router.push).toHaveBeenCalledWith('/login');
   });

   it('does not call router.push for non-401 errors', async () => {
      const res = makeResponse(403, 'application/json', { error: 'Forbidden' });
      const router = { push: jest.fn() };
      await expect(throwOnError(res, router)).rejects.toThrow('Forbidden');
      expect(router.push).not.toHaveBeenCalled();
   });

   it('does not throw for 3xx responses', async () => {
      const res = makeResponse(301, null, '');
      (res.text as jest.Mock).mockResolvedValue('');
      await expect(throwOnError(res)).resolves.toBeUndefined();
   });

   it('works without a router argument on 401', async () => {
      const res = makeResponse(401, 'application/json', { error: 'Unauthorized' });
      await expect(throwOnError(res)).rejects.toThrow('Unauthorized');
   });
});
