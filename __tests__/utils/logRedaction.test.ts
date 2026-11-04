export {};

import { redactSecrets, redactUrl } from '../../utils/logRedaction';

describe('redactSecrets', () => {
  it('redacts passwords, tokens, API keys and private keys', () => {
    expect(redactSecrets({
      password: 'a', smtp_password: 'b', scraping_api: 'c', refresh_token: 'd', private_key: 'e', apiKey: 'f', adwords_client_secret: 'g', Authorization: 'h',
    })).toEqual({
      password: '[REDACTED]', smtp_password: '[REDACTED]', scraping_api: '[REDACTED]', refresh_token: '[REDACTED]', private_key: '[REDACTED]', apiKey: '[REDACTED]', adwords_client_secret: '[REDACTED]', Authorization: '[REDACTED]',
    });
  });

  it('does not treat keyword fields as secrets', () => {
    expect(redactSecrets({ keyword: 'running shoes', keywords: ['a'], keywordID: 4, domain: 'example.com' }))
      .toEqual({ keyword: 'running shoes', keywords: ['a'], keywordID: 4, domain: 'example.com' });
  });

  it('walks nested objects and arrays, and leaves empty strings and non-strings alone', () => {
    expect(redactSecrets({ settings: { smtp_password: 'x', smtp_port: 587 }, list: [{ token: 't' }], password: '' }))
      .toEqual({ settings: { smtp_password: '[REDACTED]', smtp_port: 587 }, list: [{ token: '[REDACTED]' }], password: '' });
  });

  it('redacts extra keys such as the OAuth code and state only when asked', () => {
    expect(redactSecrets({ code: 'abc', state: 'xyz', domain: 'a.com' })).toEqual({ code: 'abc', state: 'xyz', domain: 'a.com' });
    expect(redactSecrets({ code: 'abc', state: 'xyz', domain: 'a.com' }, ['code', 'state'])).toEqual({ code: '[REDACTED]', state: '[REDACTED]', domain: 'a.com' });
  });

  it('does not change the input', () => {
    const input = { password: 'a' };
    redactSecrets(input);
    expect(input.password).toBe('a');
  });
});

describe('redactUrl', () => {
  it('hides OAuth code and state values', () => {
    expect(redactUrl('/api/adwords?code=4/abc&state=xyz&x=1')).toBe('/api/adwords?code=[REDACTED]&state=[REDACTED]&x=1');
    expect(redactUrl(undefined)).toBe('');
  });
});
