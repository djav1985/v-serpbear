import { POST as login } from '../../app/api/auth/login/route';

// The real createRoute runs here (not the test stand-in), because the cross-site check lives in it
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), authEvent: jest.fn() },
}));
jest.mock('../../database/init', () => ({ ensureDatabase: jest.fn().mockResolvedValue(undefined) }));

describe('POST /api/auth/login from another site', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, USER: 'admin', USER_NAME: 'admin', PASSWORD: 'password', SECRET: 'shhh' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([
    ['a cross-site Sec-Fetch-Site', { 'sec-fetch-site': 'cross-site' }],
    ['a same-site (sibling subdomain) Sec-Fetch-Site', { 'sec-fetch-site': 'same-site' }],
    ['a foreign Origin', { origin: 'https://evil.example' }],
  ])('is refused with 403 and sets no cookie, even with valid credentials, for %s', async (_name, headers) => {
    const response = await login(new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    }));

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});
