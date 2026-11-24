import { useState } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQueryClient } from '../__helpers__/queryClient';
import { DomainSettingsDialog } from 'app/(dashboard)/domain/_components/domain-settings-dialog';
import * as apiClient from 'utils/client/apiClient';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('utils/client/apiClient', () => ({
   callApi: jest.fn(async () => ({ domain: { domain: 'example.com', notification_emails: 'saved@example.com', scrapeEnabled: true, search_console: '{}', scraper_settings: null } })),
}));
jest.mock('utils/keywordMeta', () => ({ scraperAllowsCity: jest.fn(() => false) }));

const callApi = apiClient.callApi as jest.Mock;

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
   beforeEach(() => { callApi.mockClear(); });

   it('starts from the stored settings every time it opens, so an abandoned edit is never saved later', async () => {
      let resolveDomain!: (value: unknown) => void;
      callApi.mockImplementationOnce(() => new Promise((resolve) => { resolveDomain = resolve; }));
      renderWithQueryClient(<Page />);
      const emails = () => screen.getByRole('textbox', { name: 'Notification emails' }) as HTMLInputElement;
      await waitFor(() => expect(callApi).toHaveBeenCalledWith('domains.get', { query: { domain: 'example.com' } }));
      await act(async () => resolveDomain({ domain: { ...domain } }));
      expect(emails().value).toBe('saved@example.com');

      fireEvent.change(emails(), { target: { value: 'typed-then-abandoned@example.com' } });
      expect(emails().value).toBe('typed-then-abandoned@example.com');

      fireEvent.click(screen.getByRole('button', { name: 'Close' })); // close without saving
      expect(screen.queryByRole('textbox', { name: 'Notification emails' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'toggle' })); // open again

      expect((await screen.findByRole('textbox', { name: 'Notification emails' }) as HTMLInputElement).value).toBe('saved@example.com');
   });

   it('rejects malformed notification addresses without saving', async () => {
      renderWithQueryClient(<Page />);
      const emails = await screen.findByRole('textbox', { name: 'Notification emails' });
      fireEvent.change(emails, { target: { value: 'valid@example.com, bad-address' } });
      fireEvent.click(screen.getByRole('button', { name: 'Update Settings' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Email');
      expect(callApi).not.toHaveBeenCalledWith('domains.update', expect.anything());
   });
});
