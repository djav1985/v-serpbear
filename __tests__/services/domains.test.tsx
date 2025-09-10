import { fetchDomain, fetchDomainScreenshot, useAddDomain } from '../../services/domains';
import apiFetch from '../../services/apiClient';
import mockRouter from 'next-router-mock';
import { dummyDomain } from '../../__mocks__/data';
import { QueryClient, QueryClientProvider } from 'react-query';
import { renderHook, act } from '@testing-library/react';

jest.mock('next/router', () => jest.requireActual('next-router-mock'));
jest.mock('../../services/apiClient');
jest.mock('react-hot-toast', () => ({ __esModule: true, default: jest.fn() }));

describe('domain services', () => {
  const apiFetchMock = apiFetch as jest.Mock;

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('fetchDomain returns domain data', async () => {
    apiFetchMock.mockResolvedValue({ domain: dummyDomain });
    const res = await fetchDomain(mockRouter, 'test.com');
    expect(res.domain).toEqual(dummyDomain);
  });

  it('fetchDomain redirects on 401', async () => {
    apiFetchMock.mockRejectedValue({ status: 401 });
    await expect(fetchDomain(mockRouter, 'test.com')).rejects.toEqual({ status: 401 });
    expect(mockRouter).toMatchObject({ pathname: '/login' });
  });

  it('fetchDomainScreenshot uses cached value', async () => {
    localStorage.setItem('domainThumbs', JSON.stringify({ 'test.com': 'image' }));
    const res = await fetchDomainScreenshot('test.com');
    expect(res).toBe('image');
  });

  it('fetchDomainScreenshot handles invalid cache gracefully', async () => {
    // @ts-ignore
    global.fetch = jest.fn().mockResolvedValue({ status: 404 });
    localStorage.setItem('domainThumbs', 'not-json');
    const res = await fetchDomainScreenshot('test.com');
    expect(res).toBe(false);
  });

  it('useAddDomain invalidates cache on success', async () => {
    apiFetchMock.mockResolvedValue({ domains: [dummyDomain] });
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: any) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useAddDomain(onSuccess), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(['test.com']);
    });
    expect(invalidateSpy).toHaveBeenCalledWith('domains');
    expect(onSuccess).toHaveBeenCalled();
  });
});
