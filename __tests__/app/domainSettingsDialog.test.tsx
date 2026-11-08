import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DomainSettingsDialog } from 'app/(dashboard)/domain/_components/domain-settings-dialog';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('utils/client/apiClient', () => ({
   apiGet: jest.fn(async () => ({ domain: { domain: 'example.com', notification_emails: 'saved@example.com', scrapeEnabled: true, search_console: '{}', scraper_settings: null } })),
   apiPut: jest.fn(),
   apiDelete: jest.fn(),
}));

const domain = { ID: 1, domain: 'example.com', slug: 'example-com', notification_emails: 'saved@example.com', scrapeEnabled: true, search_console: '{}' } as unknown as DomainType;

// A button outside the dialog stands in for the page that opens and closes it.
function Page() {
   const [open, setOpen] = useState(true);
   return (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
         <button onClick={() => setOpen(!open)}>toggle</button>
         <DomainSettingsDialog open={open} onOpenChange={setOpen} domain={domain} />
      </QueryClientProvider>
   );
}

describe('DomainSettingsDialog', () => {
   it('starts from the stored settings every time it opens, so an abandoned edit is never saved later', async () => {
      render(<Page />);
      const emails = () => screen.getByPlaceholderText('Your emails') as HTMLInputElement;
      await waitFor(() => expect(emails().value).toBe('saved@example.com'));

      fireEvent.change(emails(), { target: { value: 'typed-then-abandoned@example.com' } });
      expect(emails().value).toBe('typed-then-abandoned@example.com');

      fireEvent.click(screen.getByText('toggle')); // close without saving
      await waitFor(() => expect(screen.queryByPlaceholderText('Your emails')).toBeNull());
      fireEvent.click(screen.getByText('toggle')); // open again

      await waitFor(() => expect(emails().value).toBe('saved@example.com'));
   });
});
