import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Jest isolates modules per test environment but shares the worker process. proper-lockfile's
// signal-exit hook then adds another set of process signal listeners for each isolated import.
// Tests release locks explicitly, so skip only the process-exit cleanup hook in Jest.
jest.mock('signal-exit', () => jest.fn(() => jest.fn()));

jest.mock('next/image', () => ({
  __esModule: true,
  /** @param {import('react').ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }} props */
  default: ({ src, alt, width, height, unoptimized: _unoptimized, ...rest }) => {
    const React = require('react');
    return React.createElement('img', { src, alt, width, height, ...rest });
  },
}));

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { ReadableStream, WritableStream, TransformStream } = require('stream/web');

if (!global.ReadableStream) {
  Object.defineProperty(globalThis, 'ReadableStream', { configurable: true, writable: true, value: ReadableStream });
}
if (!global.WritableStream) {
  Object.defineProperty(globalThis, 'WritableStream', { configurable: true, writable: true, value: WritableStream });
}
if (!global.TransformStream) {
  Object.defineProperty(globalThis, 'TransformStream', { configurable: true, writable: true, value: TransformStream });
}

const { fetch: undiciFetch, Headers, Request, Response } = require('undici');
// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom

if (typeof window !== 'undefined') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  });

  const locationMock = {
    hash: '',
    host: 'localhost',
    hostname: 'localhost',
    href: 'http://localhost/',
    origin: 'http://localhost',
    pathname: '/',
    port: '',
    protocol: 'http:',
    search: '',
    assign: jest.fn((value) => {
      locationMock.href = value;
    }),
    replace: jest.fn((value) => {
      locationMock.href = value;
    }),
    reload: jest.fn(),
    toString: () => locationMock.href
  };

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: locationMock
  });
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: require('resize-observer-polyfill'),
});

if (!global.fetch) {
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: undiciFetch });
}
Object.defineProperty(globalThis, 'Headers', { configurable: true, writable: true, value: Headers });
Object.defineProperty(globalThis, 'Request', { configurable: true, writable: true, value: Request });
Object.defineProperty(globalThis, 'Response', { configurable: true, writable: true, value: Response });
