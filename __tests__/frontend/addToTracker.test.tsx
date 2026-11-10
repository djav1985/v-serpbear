import React from 'react';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createQueryClientWrapper } from '../__helpers__';
import { buildAddKeywordPayloads } from 'app/(dashboard)/_components/keyword-ideas/add-to-tracker-state';
import { AddToTrackerDialog } from 'app/(dashboard)/_components/keyword-ideas/add-to-tracker-dialog';
import { useTrackedKeywordsForAdd } from 'app/(dashboard)/domain/_components/keyword-queries';
import { useAppSettings } from 'app/(dashboard)/_components/settings/settings-queries';
import * as apiClient from 'utils/client/apiClient';

jest.mock('utils/client/apiClient', () => ({
   ...jest.requireActual('utils/client/apiClient'),
   apiGet: jest.fn(),
}));

const apiGet = apiClient.apiGet as jest.Mock;
afterEach(() => apiGet.mockReset());

describe('Discover add-time duplicate checks', () => {
   it('skips only the same keyword, device, country, and selected location', () => {
      const tracked = [{ keyword: 'plumber', country: 'US', device: 'desktop', location: 'Austin,TX,US' }];
      const common = { items: [{ keyword: 'plumber', country: 'US' }], domain: 'example.com', devices: ['desktop' as const], tags: [], country: 'US', tracked };

      const sameLocation = buildAddKeywordPayloads({ ...common, location: 'Austin,TX,US' });
      const otherLocation = buildAddKeywordPayloads({ ...common, location: 'Dallas,TX,US' });
      const countryOnly = buildAddKeywordPayloads({ ...common, location: '' });

      expect(sameLocation.payloads).toHaveLength(0);
      expect(sameLocation.skipped).toEqual(['plumber (desktop)']);
      expect(otherLocation.payloads).toHaveLength(1);
      expect(countryOnly.payloads).toHaveLength(1);
   });
});

describe('add-flow query loading', () => {
   it('waits until enabled and refreshes cached add-flow data', async () => {
      const apiGet = apiClient.apiGet as jest.Mock;
      apiGet.mockImplementation(async (url: string) => (
         url === '/api/app/settings'
            ? { settings: { scraper_type: 'scrapingant' } }
            : { keywords: [] }
      ));
      const { client: queryClient, wrapper } = createQueryClientWrapper();
      queryClient.setQueryData(['keywords', 'example.com'], []);
      queryClient.setQueryData(['settings'], { scraper_type: 'old-value' });
      const { result, rerender } = renderHook(({ enabled }) => ({
         keywords: useTrackedKeywordsForAdd('example.com', enabled),
         settings: useAppSettings(enabled, true),
      }), { initialProps: { enabled: false }, wrapper });

      expect(apiGet).not.toHaveBeenCalled();
      rerender({ enabled: true });
      await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
      expect(apiGet).toHaveBeenCalledWith('/api/serp/keywords?domain=example.com');
      expect(apiGet).toHaveBeenCalledWith('/api/app/settings');
      await waitFor(() => expect(result.current.settings.data).toMatchObject({ scraper_type: 'scrapingant' }));
      queryClient.clear();

      apiGet.mockClear();
      const { client: settingsClient, wrapper: settingsWrapper } = createQueryClientWrapper();
      const { result: defaultSettings } = renderHook(() => useAppSettings(true), { wrapper: settingsWrapper });
      await waitFor(() => expect(defaultSettings.current.data).toMatchObject({ scraper_type: 'scrapingant' }));
      expect(apiGet).toHaveBeenCalledTimes(1);
      settingsClient.clear();
   });
});

describe('Discover add metadata loading', () => {
   it('holds submission until tracked keywords finish loading', () => {
      render(<AddToTrackerDialog
         selectedCount={1} existingTags={[]} existingLocations={[]} allowsCity
         isLoadingExisting onConfirm={jest.fn()} onClose={jest.fn()}
      />);

      expect(screen.getByRole('status')).toHaveTextContent('Loading tracked keywords');
      expect(screen.getByRole('button', { name: 'Loading keywords…' })).toBeDisabled();
   });

   it('offers a retry and keeps submission disabled when the lookup fails', () => {
      const retry = jest.fn();
      render(<AddToTrackerDialog
         selectedCount={1} existingTags={[]} existingLocations={[]} allowsCity
         existingLoadError onRetryExisting={retry} onConfirm={jest.fn()} onClose={jest.fn()}
      />);

      expect(screen.getByRole('alert')).toHaveTextContent('Could not load tracked keywords');
      expect(screen.getByRole('button', { name: 'Track' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(retry).toHaveBeenCalledTimes(1);
   });
});
