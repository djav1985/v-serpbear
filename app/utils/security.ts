// Input sanitization and validation utilities
/* eslint-disable no-control-regex */

/**
 * Sanitizes HTML content to prevent XSS attacks
 */
export const sanitizeHtml = (input: string): string => {
   if (typeof input !== 'string') {
      return '';
   }
   
   let sanitized = input;
   let previous;
   let iterations = 0;
   const maxIterations = 10; // Prevent infinite loops
   
   // Remove all HTML tags (apply until stable or max iterations reached)
   do {
      previous = sanitized;
      sanitized = sanitized.replace(/<[^>]*>/g, '');
      iterations++;
   } while (sanitized !== previous && iterations < maxIterations);
   // Remove javascript: protocol
   sanitized = sanitized.replace(/javascript:/gi, '');
   
   // Remove event handlers like onclick=... (apply until stable or max iterations reached)
   let prevSanitized;
   let eventRemoveIterations = 0;
   do {
      prevSanitized = sanitized;
      sanitized = sanitized.replace(/\son\w+\s*=\s*[^>\s]*/gi, '');
      eventRemoveIterations++;
   } while (sanitized !== prevSanitized && eventRemoveIterations < maxIterations);

   return sanitized
      .trim()
      .substring(0, 1000); // Limit length
};

/**
 * Validates and sanitizes email addresses
 */
export const sanitizeEmail = (email: string): { isValid: boolean; sanitized: string } => {
   if (typeof email !== 'string') {
      return { isValid: false, sanitized: '' };
   }
   
   const sanitized = email.trim().toLowerCase().substring(0, 254); // RFC 5321 limit
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
   
   return {
      isValid: emailRegex.test(sanitized),
      sanitized
   };
};

/**
 * Validates and sanitizes domain names
 */
export const sanitizeDomain = (domain: string): { isValid: boolean; sanitized: string } => {
   if (typeof domain !== 'string') {
      return { isValid: false, sanitized: '' };
   }
   
   const sanitized = domain.trim().toLowerCase().substring(0, 253); // RFC 1035 limit
   const domainRegex = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
   
   return {
      isValid: domainRegex.test(sanitized),
      sanitized
   };
};

/**
 * Sanitizes general text input
 */
export const sanitizeText = (input: any, maxLength: number = 500): string => {
   if (typeof input !== 'string') {
      return '';
   }
   
   return input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .trim()
      .substring(0, maxLength);
};

/**
 * Validates and sanitizes numeric input
 */
export const sanitizeNumber = (input: any, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): { isValid: boolean; value: number } => {
   const num = typeof input === 'string' ? parseInt(input, 10) : input;
   
   if (typeof num !== 'number' || isNaN(num) || !isFinite(num)) {
      return { isValid: false, value: 0 };
   }
   
   const clampedValue = Math.max(min, Math.min(max, num));
   
   return {
      isValid: num >= min && num <= max,
      value: clampedValue
   };
};

/**
 * Validates SQL parameter input to prevent injection
 */
export const sanitizeSqlParam = (input: any): string | number => {
   if (typeof input === 'number' && isFinite(input)) {
      return input;
   }
   
   if (typeof input === 'string') {
      return input
         .replace(/['";\\\x00\x08\x09\x0a\x0d\x1a\x22\x27\x5c]/g, '') // Remove SQL dangerous characters
         .trim()
         .substring(0, 255);
   }
   
   return '';
};

/**
 * Sanitizes JSON input to prevent JSON injection
 */
export const sanitizeJsonInput = (input: any): { isValid: boolean; sanitized: any } => {
   try {
      if (typeof input === 'string') {
         const parsed = JSON.parse(input);
         return { isValid: true, sanitized: parsed };
      }
      
      if (typeof input === 'object' && input !== null) {
         return { isValid: true, sanitized: input };
      }
      
      return { isValid: false, sanitized: null };
   } catch (_error) {
      return { isValid: false, sanitized: null };
   }
};

/**
 * Rate limiting storage for basic protection
 */
let requestCounts: { [key: string]: { count: number; resetTime: number } } = {};

/**
 * Simple rate limiting function
 */
export const checkRateLimit = (identifier: string, maxRequests: number = 100, windowMs: number = 60000): { allowed: boolean; remaining: number } => {
   const now = Date.now();
   
   // Clean up old entries
   Object.keys(requestCounts).forEach(key => {
      if (requestCounts[key].resetTime < now) {
         delete requestCounts[key];
      }
   });
   
   const existingEntry = requestCounts[identifier];
   
   if (!existingEntry || existingEntry.resetTime < now) {
      requestCounts[identifier] = { count: 1, resetTime: now + windowMs };
      return { allowed: true, remaining: maxRequests - 1 };
   }
   
   existingEntry.count++;
   const remaining = Math.max(0, maxRequests - existingEntry.count);
   
   return {
      allowed: existingEntry.count <= maxRequests,
      remaining
   };
};

/**
 * Safely trims a value that might be a string or number
 * This prevents TypeError when calling .trim() on non-string values
 */
export const safeTrim = (value: any): string => {
   if (typeof value === 'string') {
      return value.trim();
   }
   if (value === null || value === undefined) {
      return '';
   }
   return String(value).trim();
};

/**
 * Checks if a trimmed value has non-zero length
 * Handles both string and non-string values safely
 */
export const hasTrimmedLength = (value: any): boolean => safeTrim(value).length > 0;

/**
 * Trims all string properties in an object
 */
export const trimStringProperties = <T extends Record<string, unknown>>(obj: T): T => {
   const result = { ...obj };
   
   Object.entries(result).forEach(([key, value]) => {
      if (typeof value === 'string') {
         (result as Record<string, unknown>)[key] = value.trim();
      }
   });
   
   return result;
};

// Export for testing purposes
export const resetRateLimitStorage = () => {
   requestCounts = {};
};