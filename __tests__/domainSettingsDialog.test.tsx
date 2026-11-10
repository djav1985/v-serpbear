import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderWithQueryClient } from './__helpers__/queryClient';
import { DomainSettingsDialog } from 'app/(dashboard)/domain/_components/domain-settings-dialog';
import TrackerPage from 'app/(dashboard)/domain/[slug]/page';
import { loadDomainBySlug } from 'utils/domainsList';
import { getAppSettings } from 'utils/appSettings';
import { loadDomainKeywords } from 'utils/keywordsList';
import { requireSession } from 'utils/serverSession';
import { TrackerView } from 'app/(dashboard)/domain/[slug]/_components/tracker-view';
import { AddToTrackerDialog } from 'app/(dashboard)/_components/keyword-ideas/add-to-tracker-dialog';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('utils/client/apiClient', () => ({
   apiGet: jest.fn(async () => ({ domain: { domain: 'example.com', notification_emails: 'saved@example.com', scrapeEnabled: true, search_console: '{}', scraper_settings: null } })),
   apiPut: jest.fn(),
   apiDelete: jest.fn(),
}));
jest.mock('utils/domainsList', () => ({ loadDomainBySlug: jest.fn(async () => ({ ID: 1, domain: 'example.com', slug: 'example-com', search_console: '{}' })) }));
jest.mock('utils/appSettings', () => ({ getAppSettings: jest.fn(async () => ({ scraper_type: 'none', available_scapers: [], keywordsColumns: ['Best'] })) }));
jest.mock('utils/keywordsList', () => ({ loadDomainKeywords: jest.fn(async () => ({ keywords: [], backfill: jest.fn() })) }));
jest.mock('utils/serverSession', () => ({ requireSession: jest.fn() }));
jest.mock('utils/keywordMeta', () => ({ scraperAllowsCity: jest.fn(() => false) }));
jest.mock('app/(dashboard)/domain/[slug]/_components/tracker-view', () => ({ TrackerView: jest.fn(() => null) }));

const domain = { ID: 1, domain: 'example.com', slug: 'example-com', notification_emails: 'saved@example.com', scrapeEnabled: true, search_console: '{}' } as unknown as DomainType;

// A button outside the dialog stands in for the page that opens and closes it.
function Page() {
   const [open, setOpen] = useState(true);
   return (
      <div>
      <button onClick={() => setOpen(!open)}>toggle</button>
      <DomainSettingsDialog open={open} onOpenChange={setOpen} domain={domain} />
      </div>
   );
}

describe('DomainSettingsDialog', () => {
   it('starts from the stored settings every time it opens, so an abandoned edit is never saved later', async () => {
      renderWithQueryClient(<Page />);
      const emails = () => screen.getByRole('textbox', { name: 'Notification emails' }) as HTMLInputElement;
      expect((await screen.findByRole('textbox', { name: 'Notification emails' })).value).toBe('saved@example.com');

      fireEvent.change(emails(), { target: { value: 'typed-then-abandoned@example.com' } });
      expect(emails().value).toBe('typed-then-abandoned@example.com');

      fireEvent.click(screen.getByRole('button', { name: 'Close' })); // close without saving
      expect(screen.queryByRole('textbox', { name: 'Notification emails' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'toggle' })); // open again

      expect((await screen.findByRole('textbox', { name: 'Notification emails' })).value).toBe('saved@example.com');
   });
});

describe('Tracker page initial load', () => {
   it('renders without waiting for the server-side keyword list', async () => {
      jest.clearAllMocks();

      const page = await TrackerPage({ params: Promise.resolve({ slug: 'example-com' }) });

      expect(requireSession).toHaveBeenCalled();
      expect(loadDomainBySlug).toHaveBeenCalledWith('example-com');
      expect(getAppSettings).toHaveBeenCalled();
      expect(loadDomainKeywords).not.toHaveBeenCalled();
      expect(page.type).toBe(TrackerView);
      expect(page.props).toEqual(expect.objectContaining({ domain: expect.objectContaining({ domain: 'example.com' }) }));
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
