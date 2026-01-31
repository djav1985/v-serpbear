/**
 * Tests for database initialization module
 */

import { initializeDatabase, isDatabaseInitialized, resetDatabaseInitialization, ensureDatabase } from '../../database/init';
import db from '../../database/database';

jest.mock('../../database/database', () => ({
   __esModule: true,
   default: {
      sync: jest.fn(),
   },
}));

jest.mock('../../utils/logger', () => ({
   logger: {
      info: jest.fn(),
      error: jest.fn(),
   },
}));

describe('Database Initialization', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      resetDatabaseInitialization();
   });

   it('should initialize database on first call', async () => {
      (db.sync as jest.Mock).mockResolvedValue(undefined);

      await initializeDatabase();

      expect(db.sync).toHaveBeenCalledTimes(1);
      expect(isDatabaseInitialized()).toBe(true);
   });

   it('should not re-initialize if already initialized', async () => {
      (db.sync as jest.Mock).mockResolvedValue(undefined);

      await initializeDatabase();
      await initializeDatabase();
      await initializeDatabase();

      expect(db.sync).toHaveBeenCalledTimes(1);
      expect(isDatabaseInitialized()).toBe(true);
   });

   it('should return same promise for concurrent calls', async () => {
      (db.sync as jest.Mock).mockImplementation(() => 
         new Promise(resolve => setTimeout(resolve, 100))
      );

      const promise1 = initializeDatabase();
      const promise2 = initializeDatabase();
      const promise3 = initializeDatabase();

      await Promise.all([promise1, promise2, promise3]);

      expect(db.sync).toHaveBeenCalledTimes(1);
      expect(isDatabaseInitialized()).toBe(true);
   });

   it('should allow retry after initialization failure', async () => {
      (db.sync as jest.Mock)
         .mockRejectedValueOnce(new Error('Connection failed'))
         .mockResolvedValueOnce(undefined);

      await expect(initializeDatabase()).rejects.toThrow('Connection failed');
      expect(isDatabaseInitialized()).toBe(false);

      await initializeDatabase();
      expect(isDatabaseInitialized()).toBe(true);
      expect(db.sync).toHaveBeenCalledTimes(2);
   });

   it('should reset initialization state', async () => {
      (db.sync as jest.Mock).mockResolvedValue(undefined);

      await initializeDatabase();
      expect(isDatabaseInitialized()).toBe(true);

      resetDatabaseInitialization();
      expect(isDatabaseInitialized()).toBe(false);

      await initializeDatabase();
      expect(db.sync).toHaveBeenCalledTimes(2);
   });

   it('should ensure database is initialized when called', async () => {
      (db.sync as jest.Mock).mockResolvedValue(undefined);

      await ensureDatabase();

      expect(db.sync).toHaveBeenCalledTimes(1);
      expect(isDatabaseInitialized()).toBe(true);
   });

   it('should not re-initialize database if already initialized via ensureDatabase', async () => {
      (db.sync as jest.Mock).mockResolvedValue(undefined);

      await initializeDatabase();
      await ensureDatabase();
      await ensureDatabase();

      expect(db.sync).toHaveBeenCalledTimes(1);
      expect(isDatabaseInitialized()).toBe(true);
   });

   it('should handle concurrent ensureDatabase calls without race conditions', async () => {
      (db.sync as jest.Mock).mockImplementation(() => 
         new Promise(resolve => setTimeout(resolve, 100))
      );

      // Simulate multiple API requests arriving simultaneously
      const promise1 = ensureDatabase();
      const promise2 = ensureDatabase();
      const promise3 = ensureDatabase();

      await Promise.all([promise1, promise2, promise3]);

      // Database should only be initialized once
      expect(db.sync).toHaveBeenCalledTimes(1);
      expect(isDatabaseInitialized()).toBe(true);
   });

   it('should propagate initialization errors from ensureDatabase and allow retry', async () => {
      (db.sync as jest.Mock)
         .mockRejectedValueOnce(new Error('Database connection failed'))
         .mockResolvedValueOnce(undefined);

      // First call should fail
      await expect(ensureDatabase()).rejects.toThrow('Database connection failed');
      expect(isDatabaseInitialized()).toBe(false);

      // Second call should succeed (retry after failure)
      await ensureDatabase();
      expect(isDatabaseInitialized()).toBe(true);
      expect(db.sync).toHaveBeenCalledTimes(2);
   });
});
