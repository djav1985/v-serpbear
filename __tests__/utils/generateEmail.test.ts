import { readFile } from 'fs/promises';
import generateEmail from '../../app/utils/generateEmail';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

const mockReadFile = readFile as jest.Mock;

describe('generateEmail', () => {
  it('includes location details in keyword table when provided', async () => {
    mockReadFile.mockResolvedValue('<html>{{keywordsTable}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'test keyword',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 5,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        location: 'Berlin,Berlin State,DE',
        mapPackTop3: true,
      },
    ] as any;

    const settings = { search_console_client_email: '', search_console_private_key: '', keywordsColumns: [] } as any;

    const html = await generateEmail({ domain: 'example.com' } as any, keywords, settings);
    expect(html).toContain('(Berlin, Berlin State)');
    expect(html).toContain('map-pack-flag');
  });

  it('separates icons from keyword text into dedicated column', async () => {
    mockReadFile.mockResolvedValue('<html>{{keywordsTable}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'very long keyword that might wrap to multiple lines in email',
        device: 'mobile',
        country: 'DE',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 3,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        location: 'Munich,Bavaria,DE',
        mapPackTop3: true,
      },
    ] as any;

    const settings = { search_console_client_email: '', search_console_private_key: '', keywordsColumns: [] } as any;

    const html = await generateEmail({ domain: 'example.com' } as any, keywords, settings);
    
    // Verify icons are in their own column (first <td>)
    expect(html).toMatch(/<td><span class="flag-stack">.*<\/span><\/td>/);
    
    // Verify keyword text is in separate column (second <td>) with device icon
    expect(html).toMatch(/<td><img class="device".*> very long keyword that might wrap to multiple lines in email<\/td>/);
    
    // Verify location is in third column
    expect(html).toContain('<td>(Munich, Bavaria)</td>');
    
    // Verify map pack flag is included in the icon column
    expect(html).toContain('map-pack-flag');
    expect(html).toContain('MP</span>');
  });
});
