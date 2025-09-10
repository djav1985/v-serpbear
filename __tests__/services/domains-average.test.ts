import React from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import mockRouter from 'next-router-mock';
import { useFetchDomains } from '../../services/domains';
import { useRefreshKeywords } from '../../services/keywords';
import apiFetch from '../../services/apiClient';
import { dummyDomain } from '../../__mocks__/data';

jest.mock('next/router', () => jest.requireActual('next-router-mock'));
jest.mock('../../services/apiClient');
jest.mock('react-hot-toast', () => ({ __esModule: true, default: jest.fn() }));

describe('domain average refresh', () => {
  const apiFetchMock = apiFetch as jest.Mock;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('refetches domains after keyword mutations', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: any) =>
      React.createElement(QueryClientProvider, { client: queryClient, children });

    apiFetchMock
      .mockResolvedValueOnce({ domains: [dummyDomain] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ domains: [{ ...dummyDomain, avgPosition: 10 }] });

    const { result: domainsHook } = renderHook(
      () => useFetchDomains(mockRouter as any, true),
      { wrapper }
    );

    await waitFor(() =>
      expect(domainsHook.current.data?.domains[0].avgPosition).toBe(
        dummyDomain.avgPosition
      )
    );

    const { result: refreshHook } = renderHook(
      () => useRefreshKeywords(jest.fn()),
      { wrapper }
    );

    await act(async () => {
      await refreshHook.current.mutateAsync({ ids: [], domain: dummyDomain.domain });
    });

    await waitFor(() =>
      expect(domainsHook.current.data?.domains[0].avgPosition).toBe(10)
    );
  });
});
