import { createMockResponse, createMockRequest } from './index';

describe('Test Helpers', () => {
  describe('createMockResponse', () => {
    it('creates a mock response with chainable status method', () => {
      const res = createMockResponse();
      
      expect(res.status).toBeDefined();
      expect(res.json).toBeDefined();
      expect(res.send).toBeDefined();
      expect(res.setHeader).toBeDefined();
      expect(res.end).toBeDefined();
      
      // Test chaining
      const chainResult = res.status(200);
      expect(chainResult).toBe(res);
    });
    
    it('supports status and json call pattern', () => {
      const res = createMockResponse();
      
      res.status(200).json({ success: true });
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
  
  describe('createMockRequest', () => {
    it('creates a mock request with default values', () => {
      const req = createMockRequest();
      
      expect(req.method).toBe('GET');
      expect(req.query).toEqual({});
      expect(req.body).toEqual({});
      expect(req.headers).toEqual({});
    });
    
    it('allows overriding default values', () => {
      const req = createMockRequest({
        method: 'POST',
        body: { test: 'data' },
        query: { id: '123' },
      });
      
      expect(req.method).toBe('POST');
      expect(req.body).toEqual({ test: 'data' });
      expect(req.query).toEqual({ id: '123' });
    });
  });
});
