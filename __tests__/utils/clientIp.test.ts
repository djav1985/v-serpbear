export {};

import type { NextApiRequest } from 'next';
import { getClientIp } from '../../utils/api/clientIp';

const makeReq = (headers: Record<string, string | string[]>, remoteAddress = '10.0.0.9') => (
  { headers, socket: { remoteAddress } } as unknown as NextApiRequest
);

describe('getClientIp', () => {
  const original = process.env.TRUST_PROXY;
  afterEach(() => {
    if (original === undefined) { delete process.env.TRUST_PROXY; } else { process.env.TRUST_PROXY = original; }
  });

  it('uses the socket address by default and ignores a forwarded header', () => {
    delete process.env.TRUST_PROXY;
    expect(getClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4' }))).toBe('10.0.0.9');
  });

  it('reads the entry one hop from the right when TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true';
    // the client-supplied first entry is ignored; our proxy appended the last one
    expect(getClientIp(makeReq({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5' }))).toBe('203.0.113.5');
  });

  it('honours a hop count', () => {
    process.env.TRUST_PROXY = '2';
    expect(getClientIp(makeReq({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5, 172.16.0.1' }))).toBe('203.0.113.5');
  });

  it('falls back to the socket address when the entry is missing or not an IP', () => {
    process.env.TRUST_PROXY = '1';
    expect(getClientIp(makeReq({}))).toBe('10.0.0.9');
    expect(getClientIp(makeReq({ 'x-forwarded-for': 'not-an-ip' }))).toBe('10.0.0.9');
    process.env.TRUST_PROXY = '3';
    expect(getClientIp(makeReq({ 'x-forwarded-for': '203.0.113.5' }))).toBe('10.0.0.9');
  });

  it('returns unknown without a socket address', () => {
    delete process.env.TRUST_PROXY;
    expect(getClientIp({ headers: {} } as unknown as NextApiRequest)).toBe('unknown');
  });
});
