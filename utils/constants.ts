/**
 * Shared constants used across the application
 */
export const GOOGLE_BASE_URL = 'https://www.google.com';

export const DEVICE_DESKTOP = 'desktop';
export const DEVICE_MOBILE = 'mobile';
export const DEVICE_TYPES = [DEVICE_DESKTOP, DEVICE_MOBILE] as const;
export type DeviceType = typeof DEVICE_TYPES[number];

export const DEFAULT_SCRAPE_DELAY_MS = 0;
export const MAX_SCRAPE_DELAY_MS = 30000;
export const MAX_RETRY_DELAY_MS = 30000;
export const BASE_SCRAPER_TIMEOUT_MS = 15000;
export const RETRY_TIMEOUT_INCREMENT_MS = 5000;
export const DEFAULT_SCRAPER_TIMEOUT_MS = 30000;
export const DEFAULT_PARALLEL_SCRAPERS = ['scrapingant', 'serpapi', 'searchapi'] as const;
export const VALUESERP_TIMEOUT_MS = 35000;
export const DEFAULT_REFRESH_BATCH_SIZE = 5;

export const CHART_DATASET_KEY_MAIN = 'chart-series';
export const CHART_DATASET_KEY_SLIM = 'chart-series-slim';
export const CHART_DATASET_KEY_INSIGHT = 'chart-series-insight';
