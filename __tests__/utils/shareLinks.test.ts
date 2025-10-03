import { createDomainShareLink, hashShareToken, resolveDomainForShareToken, buildShareUrl } from '../../utils/shareLinks';
import Domain from '../../database/models/domain';

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
  },
}));

const mockedDomain = Domain as unknown as {
  findByPk: jest.Mock;
  findOne: jest.Mock;
};

describe('shareLinks utility', () => {
  const originalSecret = process.env.SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalTtl = process.env.SHARE_TOKEN_TTL_HOURS;

  beforeEach(() => {
    process.env.SECRET = 'test-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    delete process.env.SHARE_TOKEN_TTL_HOURS;
    mockedDomain.findByPk.mockReset();
    mockedDomain.findOne.mockReset();
  });

  afterAll(() => {
    process.env.SECRET = originalSecret;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    if (originalTtl) {
      process.env.SHARE_TOKEN_TTL_HOURS = originalTtl;
    } else {
      delete process.env.SHARE_TOKEN_TTL_HOURS;
    }
  });

  it('creates and persists a share token for a domain', async () => {
    const update = jest.fn();
    mockedDomain.findByPk.mockResolvedValue({ update });

    const result = await createDomainShareLink({ ID: 1 } as any);

    expect(result.url).toMatch(/https:\/\/app\.example\.com\/share\//);
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(10);

    const hashed = hashShareToken(result.token);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      share_token_hash: hashed,
    }));

    const expiresAt = new Date(result.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('resolves domain when token is valid and not expired', async () => {
    const token = 'valid-token';
    const hash = hashShareToken(token);

    mockedDomain.findOne.mockResolvedValue({
      get: () => ({
        ID: 1,
        domain: 'example.com',
        share_token_hash: hash,
        share_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    });

    const { domain, expired } = await resolveDomainForShareToken(token);
    expect(expired).toBe(false);
    expect(domain?.domain).toBe('example.com');
  });

  it('marks token as expired when expiry timestamp has passed', async () => {
    const token = 'expired-token';
    mockedDomain.findOne.mockResolvedValue({
      get: () => ({
        ID: 2,
        domain: 'old.com',
        share_token_hash: hashShareToken(token),
        share_token_expires_at: new Date(Date.now() - 1).toISOString(),
      }),
    });

    const { domain, expired } = await resolveDomainForShareToken(token);
    expect(expired).toBe(true);
    expect(domain).toBeNull();
  });

  it('builds relative share URL when app URL is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(buildShareUrl('token-123')).toBe('/share/token-123');
  });
});
