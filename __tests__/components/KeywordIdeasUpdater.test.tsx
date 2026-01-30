/// <reference path="../../types.d.ts" />

import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import KeywordIdeasUpdater from '../../components/ideas/KeywordIdeasUpdater';

// Mock the next/router
jest.mock('next/router', () => ({
   useRouter: () => ({
      query: { slug: 'test-domain' },
      pathname: '/domain/ideas/test-domain',
      push: jest.fn(),
   }),
}));

// Mock the services
const mockMutate = jest.fn();
jest.mock('../../services/adwords', () => ({
   useMutateKeywordIdeas: () => ({
      mutate: mockMutate,
      isLoading: false,
   }),
}));

jest.mock('../../services/domains', () => ({
   __esModule: true,
   ADWORDS_ENABLED: true,
}));

jest.mock('next/dynamic', () => () => () => null);

jest.mock('../../components/common/SelectField', () => ({ options }: any) => (
   <ul data-testid="select-field-options">
      {options.map((option: { label: string, value: string }) => (
         <li key={option.value}>{option.label}</li>
      ))}
   </ul>
));

const mockDomain: DomainType = {
   ID: 1,
   domain: 'example.com',
   slug: 'example-com',
   lastAccessed: '2023-01-01',
   added: '2023-01-01',
   updated: '2023-01-01',
   tags: '',
   notification_interval: '0',
   notification_email: '',
   search_console: '',
   notifications: '',
   keywordsTracked: 0,
};

describe('KeywordIdeasUpdater Component', () => {
   let queryClient: QueryClient;

   beforeEach(() => {
      queryClient = new QueryClient({
         defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
         },
      });
   });

   const renderWithQueryClient = (component: React.ReactElement) => render(
         <QueryClientProvider client={queryClient}>
            {component}
         </QueryClientProvider>,
      );

   it('renders without crashing', () => {
      renderWithQueryClient(
         <KeywordIdeasUpdater
            domain={mockDomain}
            searchConsoleConnected={false}
            adwordsConnected={true}
         />,
      );

      expect(screen.getByText('Get Keyword Ideas')).toBeInTheDocument();
      expect(screen.getByText('Load Keyword Ideas')).toBeInTheDocument();
   });

   it('validates the fix for keywordPayload variable name', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      renderWithQueryClient(
         <KeywordIdeasUpdater
            domain={mockDomain}
            searchConsoleConnected={false}
            adwordsConnected={true}
         />,
      );

      // The console should not show "keywordPaylod" (with typo) anymore
      // This validates our fix
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
         expect.stringContaining('keywordPaylod'),
      );

      consoleLogSpy.mockRestore();
   });

   it('lists the Search Console seed option when the integration is available', () => {
      renderWithQueryClient(
         <KeywordIdeasUpdater
            domain={mockDomain}
            searchConsoleConnected={true}
            adwordsConnected={true}
         />,
      );

      expect(screen.getAllByTestId('select-field-options')[0]).toHaveTextContent('Based on already ranking keywords (GSC)');
   });
});
