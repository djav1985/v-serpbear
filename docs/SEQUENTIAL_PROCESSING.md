# Sequential Domain Processing with Refresh Queue

## Overview

This document describes the sequential domain processing implementation with a global refresh queue that ensures single-writer database access for all keyword scraping operations.

## Problem Statement

Previously, SerpBear had two concurrency issues:

1. **Cron jobs**: Could process multiple domains simultaneously
2. **Manual refresh**: Multiple manual refresh operations could be triggered in quick succession, causing parallel execution

Both scenarios created potential database concurrency issues where:
- Multiple domains writing to the database at the same time
- Race conditions in keyword status updates
- Potential data inconsistencies

## Solution

The implementation now uses a **centralized refresh queue** that ensures:
1. Only one refresh operation (cron or manual) runs at a time
2. All refresh requests are queued and processed sequentially
3. Single-writer database access is guaranteed system-wide

## Implementation Details

### Refresh Queue (`utils/refreshQueue.ts`)

A singleton queue manager that:
- Accepts refresh tasks from both cron and manual refresh endpoints
- Processes tasks sequentially (FIFO)
- Continues processing even if a task fails
- Provides queue status for monitoring

**Key Features:**
```typescript
class RefreshQueue {
   enqueue(taskId: string, task: () => Promise<void>): Promise<void>
   getStatus(): { queueLength, isProcessing, pendingTaskIds }
}
```

### Cron Endpoint (`/api/cron`)

The cron endpoint now:
1. Identifies all enabled domains
2. Enqueues a single task that processes all domains sequentially
3. Returns immediately with 200 status
4. The task processes domains one at a time in the queue

**Processing Flow:**
```
Cron triggered → Enqueue "cron-refresh" task → Queue processes:
  For each domain:
    1. Mark keywords as updating
    2. Fetch keywords
    3. Call refreshAndUpdateKeywords() and AWAIT
    4. Move to next domain
```

### Manual Refresh Endpoint (`/api/refresh`)

The manual refresh endpoint now:
1. Validates and filters keywords to refresh
2. Marks keywords as updating
3. Enqueues a task with ID based on refresh type
4. Returns immediately with 200 status
5. The task processes keywords in the queue

**Task IDs:**
- `manual-refresh-domain-{domain}` - When refreshing all keywords for a domain
- `manual-refresh-ids-{id1,id2,...}` - When refreshing specific keyword IDs

**Processing Flow:**
```
Manual refresh triggered → Mark keywords updating → Enqueue task → Queue processes:
  1. Execute refreshAndUpdateKeywords() for the keywords
  2. Clear updating flags on completion/error
```

## Queue Behavior

### Sequential Processing

When multiple refresh operations are triggered:

**Example Scenario:**
1. User clicks refresh on Domain A → Task "manual-refresh-domain-A" enqueued
2. User immediately clicks refresh on Domain B → Task "manual-refresh-domain-B" enqueued  
3. Cron job triggers → Task "cron-refresh" enqueued

**Processing Order:**
```
Queue: [manual-refresh-domain-A, manual-refresh-domain-B, cron-refresh]
       ↓
Process: manual-refresh-domain-A (wait for completion)
       ↓
Process: manual-refresh-domain-B (wait for completion)
       ↓
Process: cron-refresh (processes all domains sequentially)
       ↓
Queue empty
```

### Error Handling

Both implementations include robust error handling:
- If a task fails, the error is logged
- Queue continues processing the next task
- Keywords get their updating flags cleared on error
- System remains operational even with failures

## Benefits

### Data Consistency
- Guaranteed single-writer database access
- Zero race conditions in keyword updates
- Sequential processing ensures data integrity

### Error Isolation
- Task failures don't affect other tasks in the queue
- Each task's keywords get updating flags cleared on error
- Comprehensive error logging for debugging

### System-Wide Coordination
- Cron and manual refreshes coordinate through the queue
- No parallel execution of refresh operations
- Predictable and observable processing order

### Observability
- Each task has a unique ID for tracking
- Queue status available via `getStatus()`
- Start and completion times logged per task
- Clear visibility into queue length and processing state

## Backward Compatibility

The changes maintain full backward compatibility:
- API responses remain unchanged (200 status with immediate return)
- Manual refresh behavior is unchanged from user perspective
- Cron scheduling behavior is unchanged
- All existing tests pass with queue mocking

## Testing

Tests have been updated to:
1. Mock the refresh queue to execute tasks immediately
2. Verify single domain refresh behavior for manual endpoint
3. Verify multi-domain sequential behavior for cron endpoint
4. Test queue itself for sequential processing and error handling

New test file: `__tests__/utils/refreshQueue.test.ts`

## Performance Considerations

### Sequential Processing Trade-offs

**Pros:**
- Guaranteed single-writer database access
- No concurrent write conflicts
- Predictable database load
- Easy to reason about system state

**Cons:**
- Longer total processing time when multiple refresh operations are queued
- Manual refresh must wait if cron is running
- Large cron job blocks manual refreshes

**Mitigation:**
- Each domain's keywords can still use parallel scraping (if scraper supports it)
- Background processing ensures API responses are immediate
- Users see "updating" status immediately, even if queued
- Queue processes tasks as fast as possible

### Real-World Impact

**Typical Scenario:**
- Domain A: 100 keywords, takes ~2 minutes to scrape
- Domain B: 50 keywords, takes ~1 minute to scrape

**Without Queue (Parallel):**
- Both start at same time
- Database concurrency issues possible
- Total time: ~2 minutes (parallel)

**With Queue (Sequential):**
- Domain A processes first (2 min)
- Domain B processes second (1 min)  
- Total time: ~3 minutes
- **Trade-off**: +50% time, but guaranteed correctness

## Configuration

No configuration changes are required. The queue is:
- Automatically instantiated on first import
- Shared across all API endpoints
- In-memory (suitable for single-host deployment)

## Monitoring

### Check Queue Status

The queue exposes status via `refreshQueue.getStatus()`:

```typescript
{
  queueLength: 2,           // Number of pending tasks
  isProcessing: true,       // Whether queue is actively processing
  pendingTaskIds: [...]     // Array of task IDs waiting in queue
}
```

### Monitor Processing in Logs

1. **Check task enqueueing:**
   ```
   grep "Enqueueing refresh task:" logs/app.log
   ```

2. **Verify task completion:**
   ```
   grep "Completed refresh task:" logs/app.log
   ```

3. **Monitor queue processing:**
   ```
   grep "Queue processing" logs/app.log
   ```

4. **Track processing duration:**
   Each task logs its execution time in milliseconds

### Production Monitoring Recommendations

- Set up alerts for tasks taking longer than expected
- Monitor queue length to detect backups
- Track task failure rates
- Log aggregate queue wait times

## Related Files

- `utils/refreshQueue.ts` - **New**: Centralized refresh queue manager
- `pages/api/cron.ts` - Updated to use refresh queue
- `pages/api/refresh.ts` - Updated to use refresh queue
- `utils/refresh.ts` - Core keyword refresh logic (unchanged)
- `__tests__/utils/refreshQueue.test.ts` - **New**: Queue tests
- `__tests__/api/cron.test.ts` - Updated with queue mocking
- `__tests__/api/refresh.test.ts` - Updated with queue mocking

## Future Enhancements

Potential improvements for future iterations:

1. **Priority Queue**: Allow high-priority manual refreshes to jump ahead of cron
2. **Persistent Queue**: Use Redis or database for queue persistence across restarts
3. **Distributed Queue**: Support multi-host deployments with shared queue
4. **Rate Limiting**: Add configurable delays between tasks for scraper rate limits
5. **Queue Metrics**: Expose Prometheus metrics for monitoring
6. **Task Cancellation**: Allow canceling pending tasks in the queue
