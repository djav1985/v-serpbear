/**
 * Tests for configurable refresh queue concurrency
 */

describe('RefreshQueue Concurrency Configuration', () => {
   let originalEnv: NodeJS.ProcessEnv;

   beforeEach(() => {
      originalEnv = process.env;
      jest.resetModules();
   });

   afterEach(() => {
      process.env = originalEnv;
   });

   it('should use default concurrency of 3 when env var not set', () => {
      delete process.env.REFRESH_QUEUE_CONCURRENCY;
      
      const { refreshQueue } = require('../../utils/refreshQueue');
      const status = refreshQueue.getStatus();
      
      expect(status.maxConcurrency).toBe(3);
   });

   it('should read concurrency from environment variable', () => {
      process.env.REFRESH_QUEUE_CONCURRENCY = '5';
      
      const { refreshQueue } = require('../../utils/refreshQueue');
      const status = refreshQueue.getStatus();
      
      expect(status.maxConcurrency).toBe(5);
   });

   it('should use default when env var is invalid', () => {
      process.env.REFRESH_QUEUE_CONCURRENCY = 'invalid';
      
      const { refreshQueue } = require('../../utils/refreshQueue');
      const status = refreshQueue.getStatus();
      
      expect(status.maxConcurrency).toBe(3);
   });

   it('should use default when env var is 0', () => {
      process.env.REFRESH_QUEUE_CONCURRENCY = '0';
      
      const { refreshQueue } = require('../../utils/refreshQueue');
      const status = refreshQueue.getStatus();
      
      expect(status.maxConcurrency).toBe(3);
   });

   it('should use default when env var is negative', () => {
      process.env.REFRESH_QUEUE_CONCURRENCY = '-1';
      
      const { refreshQueue } = require('../../utils/refreshQueue');
      const status = refreshQueue.getStatus();
      
      expect(status.maxConcurrency).toBe(3);
   });

   it('should allow setting concurrency to 1', () => {
      process.env.REFRESH_QUEUE_CONCURRENCY = '1';
      
      const { refreshQueue } = require('../../utils/refreshQueue');
      const status = refreshQueue.getStatus();
      
      expect(status.maxConcurrency).toBe(1);
   });

   it('should allow high concurrency values', () => {
      process.env.REFRESH_QUEUE_CONCURRENCY = '10';
      
      const { refreshQueue } = require('../../utils/refreshQueue');
      const status = refreshQueue.getStatus();
      
      expect(status.maxConcurrency).toBe(10);
   });
});
