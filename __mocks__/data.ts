import { DEFAULT_BRANDING } from '../utils/branding';

const { platformName } = DEFAULT_BRANDING;

export const dummyDomain = {
   ID: 1,
   domain: 'compressimage.io',
   slug: 'compressimage-io',
   keywordsTracked: 10,
   avgPosition: 24,
   mapPackKeywords: 3,
   lastUpdated: '2022-11-11T10:00:32.243',
   added: '2022-11-11T10:00:32.244',
   tags: '',
   scrapeEnabled: true,
   notification: true,
   notification_interval: 'daily',
   notification_emails: '',
};

export const dummyKeywords = [
   {
       ID: 1,
       keyword: 'compress image',
       device: 'desktop',
       country: 'US',
       domain: 'compressimage.io',
       location: 'New York,NY,US',
       lastUpdated: '2022-11-15T10:49:53.113',
       added: '2022-11-11T10:01:06.951',
       position: 19,
       volume: 10000,
       history: {
           '2022-11-11': 21,
           '2022-11-12': 24,
           '2022-11-13': 24,
           '2022-11-14': 20,
           '2022-11-15': 19,
       },
       url: 'https://compressimage.io/',
       tags: [],
       lastResult: [
         {
            position: 1,
            url: 'https://compressimage.io/',
            title: 'Compress Image Tool',
         },
         {
            position: 2,
            url: 'https://example.com/alternative',
            title: 'Alternative Result',
         },
       ],
       sticky: false,
       updating: false,
       lastUpdateError: false as false,
       mapPackTop3: true,
   },
   {
       ID: 2,
       keyword: 'image compressor',
       device: 'desktop',
       country: 'US',
       domain: 'compressimage.io',
       location: 'Los Angeles,CA,US',
       lastUpdated: '2022-11-15T10:49:53.119',
       added: '2022-11-15T10:01:06.951',
       position: 29,
       volume: 1200,
       history: {
           '2022-11-11': 33,
           '2022-11-12': 34,
           '2022-11-13': 17,
           '2022-11-14': 30,
           '2022-11-15': 29,
       },
       url: 'https://compressimage.io/',
       tags: ['compressor'],
       lastResult: [
         {
            position: 1,
            url: 'https://compressimage.io/',
            title: 'Compress Image Tool',
         },
       ],
       sticky: false,
       updating: false,
       lastUpdateError: false as false,
       mapPackTop3: false,
   },
];

export const dummySettings = {
   scraping_api: '',
   scraper_type: 'none',
   notification_interval: 'never',
   notification_email: '',
   notification_email_from: '',
   notification_email_from_name: platformName,
   smtp_server: '',
   smtp_port: '',
   smtp_username: '',
   smtp_password: '',
   scrape_retry: false,
   search_console_integrated: false,
   available_scapers: [],
   failed_queue: [],
};
