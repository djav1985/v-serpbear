import TrackerPage from 'app/(dashboard)/domain/[slug]/page';
import { loadDomainBySlug } from 'utils/domainsList';
import { getAppSettings } from 'utils/appSettings';
import { loadDomainKeywords } from 'utils/keywordsList';
import { requireSession } from 'utils/serverSession';
import { TrackerView } from 'app/(dashboard)/domain/[slug]/_components/tracker-view';

jest.mock('utils/domainsList', () => ({ loadDomainBySlug: jest.fn(async () => ({ ID: 1, domain: 'example.com', slug: 'example-com', search_console: '{}' })) }));
jest.mock('utils/appSettings', () => ({ getAppSettings: jest.fn(async () => ({ scraper_type: 'none', available_scapers: [], keywordsColumns: ['Best'] })) }));
jest.mock('utils/keywordsList', () => ({ loadDomainKeywords: jest.fn(async () => ({ keywords: [], backfill: jest.fn() })) }));
jest.mock('utils/serverSession', () => ({ requireSession: jest.fn() }));
jest.mock('app/(dashboard)/domain/[slug]/_components/tracker-view', () => ({ TrackerView: jest.fn(() => null) }));

describe('Tracker page initial load', () => {
   it('renders without waiting for the server-side keyword list', async () => {
      const page = await TrackerPage({ params: Promise.resolve({ slug: 'example-com' }) });

      expect(requireSession).toHaveBeenCalled();
      expect(loadDomainBySlug).toHaveBeenCalledWith('example-com');
      expect(getAppSettings).toHaveBeenCalled();
      expect(loadDomainKeywords).not.toHaveBeenCalled();
      expect(page.type).toBe(TrackerView);
      expect(page.props).toEqual(expect.objectContaining({ domain: expect.objectContaining({ domain: 'example.com' }) }));
   });
});
