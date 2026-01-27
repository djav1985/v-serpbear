# Sequential Domain Processing

## Overview

This document describes the sequential domain processing implementation that ensures single-writer database access for keyword scraping operations.

## Problem Statement

Previously, SerpBear could process multiple domains simultaneously during both cron jobs and manual refresh operations. This created potential database concurrency issues where:
- Multiple domains writing to the database at the same time
- Race conditions in keyword status updates
- Potential data inconsistencies

## Solution

The implementation now processes domains sequentially, ensuring that only one domain's keywords are being scraped and updated at a time.

## Implementation Details

### Cron Endpoint (`/api/cron`)

The cron endpoint now:
1. Identifies all enabled domains
2. Calls `processDomainsSequentially()` to process domains one at a time
3. Each domain's keywords are fully processed (scraped and updated) before moving to the next
4. Returns immediately with a 200 status (background processing)

**Key Function:**
```typescript
const processDomainsSequentially = async (domains: string[], settings: SettingsType): Promise<void>
```

**Processing Flow:**
```
For each domain:
  1. Mark all keywords as updating (set updating flag)
  2. Fetch all keywords for the domain
  3. Call refreshAndUpdateKeywords() and AWAIT completion
  4. Move to next domain
```

### Manual Refresh Endpoint (`/api/refresh`)

The manual refresh endpoint now:
1. Groups requested keywords by domain
2. Calls `processDomainsSequentiallyForRefresh()` to process each domain's keywords
3. Processes domains sequentially even when refreshing specific keyword IDs
4. Returns immediately with a 200 status (background processing)

**Key Function:**
```typescript
const processDomainsSequentiallyForRefresh = async (
   domains: string[],
   keywordsByDomain: Map<string, Keyword[]>,
   settings: SettingsType
): Promise<void>
```

**Processing Flow:**
```
For each domain:
  1. Get keywords for this domain from the map
  2. Mark those keywords as updating
  3. Call refreshAndUpdateKeywords() and AWAIT completion
  4. Move to next domain
```

## Error Handling

Both implementations include robust error handling:
- If a domain's processing fails, the error is logged
- The updating flags for that domain's keywords are cleared
- Processing continues with the next domain
- This ensures one failing domain doesn't block others

## Benefits

### Data Consistency
- Only one domain writes to the database at a time
- Eliminates race conditions in keyword updates
- Ensures sequential processing of scraping operations

### Error Isolation
- Domain failures don't affect other domains
- Each domain's keywords get their updating flags cleared on error
- Comprehensive error logging for debugging

### Observability
- Each domain processing step is logged
- Start and completion times tracked per domain
- Clear visibility into sequential processing flow

## Backward Compatibility

The changes maintain full backward compatibility:
- API responses remain unchanged (200 status with background processing)
- Manual refresh still works for individual keywords
- Cron scheduling behavior is unchanged
- All existing tests pass without modification (except for new sequential behavior)

## Testing

Tests have been updated to verify:
1. Single domain processing works correctly
2. Multiple domains are processed sequentially (not in parallel)
3. Each domain's keywords are updated separately
4. API responses are sent immediately before background processing

## Performance Considerations

### Sequential Processing Trade-offs

**Pros:**
- Guaranteed single-writer database access
- No concurrent write conflicts
- Predictable database load

**Cons:**
- Longer total processing time for multiple domains
- Domain N must wait for domains 1..N-1 to complete

**Mitigation:**
- Each domain's keywords can still use parallel scraping (if scraper supports it)
- Background processing ensures API responses are immediate
- Users don't wait for completion

### Optimization Opportunities

Future optimizations could include:
- Per-domain locking instead of global sequential processing
- Queue-based processing with configurable concurrency limits
- Database connection pooling with transaction isolation

## Configuration

No configuration changes are required. The sequential processing is automatic and applies to:
- Cron-triggered scraping (`/api/cron`)
- Manual refresh operations (`/api/refresh`)
- Retry queue processing

## Monitoring

To monitor sequential processing in production:

1. **Check logs for domain processing:**
   ```
   grep "Processing domain:" logs/app.log
   ```

2. **Verify sequential completion:**
   ```
   grep "Completed processing domain:" logs/app.log
   ```

3. **Monitor processing duration:**
   Look for timestamps between start and completion of each domain

## Related Files

- `pages/api/cron.ts` - Cron endpoint with sequential processing
- `pages/api/refresh.ts` - Manual refresh endpoint with sequential processing
- `utils/refresh.ts` - Core keyword refresh logic (unchanged)
- `__tests__/api/cron.test.ts` - Cron endpoint tests
- `__tests__/api/refresh.test.ts` - Refresh endpoint tests
