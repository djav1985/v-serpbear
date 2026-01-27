# Parallel Domain Processing with Refresh Queue

## Overview

SerpBear now supports **parallel domain processing** with intelligent per-domain locking and SQLite WAL mode for optimal performance and data safety.

## Problem Statement

**Initial Challenge**: Processing domains sequentially was safe but slow when dealing with multiple domains.

**Requirements**:
1. Process multiple domains in parallel for better performance
2. Prevent the same domain from being refreshed simultaneously
3. Avoid database concurrency conflicts
4. Handle SQLite locking gracefully

## Solution

The implementation uses a **refresh queue with parallel processing** that:
- Processes up to 3 domains concurrently (configurable)
- Enforces per-domain locks to prevent duplicate refreshes
- Uses SQLite WAL mode for concurrent database access
- Sets busy_timeout for graceful lock handling

## Architecture

### Refresh Queue (`utils/refreshQueue.ts`)

A sophisticated queue manager that coordinates all refresh operations:

**Key Features:**
- **Parallel Processing**: Processes multiple domains simultaneously up to `maxConcurrency` limit (default: 3)
- **Per-Domain Locking**: Tracks active domains, prevents duplicate processing
- **Smart Scheduling**: Automatically finds next available domain when a slot opens
- **Error Isolation**: Domain failures don't affect other domains

**Queue Behavior:**
```typescript
enqueue(taskId: string, task: () => Promise<void>, domain?: string)
```

- If domain not specified: Task runs as soon as a slot is available
- If domain specified: Task runs only when that domain is not locked

### SQLite Configuration (`database/sqlite-dialect.js`)

**WAL Mode (Write-Ahead Logging)**:
```javascript
this.driver.pragma('journal_mode = WAL');
this.driver.pragma('synchronous = NORMAL');
```

Benefits:
- Readers don't block writers
- Writers don't block readers  
- Perfect for parallel domain processing (each domain touches different rows)
- Faster than default journaling

**Busy Timeout**:
```javascript
this.driver.pragma('busy_timeout = 5000');
```

Benefits:
- Waits up to 5 seconds instead of failing immediately on locks
- Handles transient lock contention gracefully
- Prevents race conditions on shared resources

### Cron Endpoint (`pages/api/cron.ts`)

Enqueues each domain separately for parallel processing:

```typescript
for (const domain of enabledDomains) {
   refreshQueue.enqueue(
      `cron-refresh-${domain}`,
      async () => await processSingleDomain(domain, settings),
      domain // Per-domain locking
   );
}
```

### Manual Refresh (`pages/api/refresh.ts`)

Passes domain for locking:

```typescript
refreshQueue.enqueue(
   taskId,
   async () => await refreshAndUpdateKeywords(keywords, settings),
   refreshDomain // Per-domain locking
);
```

## Example Scenarios

### Scenario 1: Cron Triggers with 5 Domains

```
Time 0s:  Enqueue all 5 domains
Time 0s:  [domain-a, domain-b, domain-c] start processing (3 slots filled)
Time 90s: domain-b finishes → domain-d starts immediately
Time 120s: domain-a finishes → domain-e starts immediately  
Time 150s: domain-c finishes
Time 180s: domain-d and domain-e finish
Total: ~3 minutes (vs 7.5 minutes sequential)
```

### Scenario 2: Duplicate Domain Refresh

```
User clicks refresh on domain-a
  → task-1 enqueued, starts processing (lock acquired)
  
User clicks refresh on domain-a again (quickly)
  → task-2 enqueued, BLOCKED by domain lock
  
task-1 completes
  → domain lock released
  
task-2 starts immediately
  → processes with fresh data
```

### Scenario 3: Mixed Operations

```
Queue State: [cron-domain-a (processing), manual-domain-b (processing), manual-domain-a (queued)]

Processing: domain-a and domain-b in parallel
Queued: manual-domain-a waits for cron-domain-a to finish
  
cron-domain-a completes → manual-domain-a starts immediately
domain-b completes independently
```

## Performance Analysis

### Before: Sequential Processing

| Domain | Keywords | Time |
|--------|----------|------|
| A | 100 | 2 min |
| B | 50 | 1 min |
| C | 75 | 1.5 min |
| **Total** | **225** | **4.5 min** |

### After: Parallel Processing (maxConcurrency=3)

| Domain | Keywords | Time | Slot |
|--------|----------|------|------|
| A | 100 | 2 min | 1 |
| B | 50 | 1 min | 2 |
| C | 75 | 1.5 min | 3 |
| **Total** | **225** | **2 min** | - |

**Speedup: 2.25x faster** (limited by slowest domain)

### Scalability

With 10 domains at maxConcurrency=3:
- **Sequential**: ~10-15 minutes
- **Parallel (3)**: ~4-6 minutes (3x improvement)
- **Parallel (5)**: ~3-4 minutes (4x improvement)

## Configuration

### Adjust Concurrency

```typescript
import { refreshQueue } from './utils/refreshQueue';

// Set maximum concurrent domains
refreshQueue.setMaxConcurrency(5);
```

**Considerations:**
- **Lower (1-2)**: Safer for limited resources, slower
- **Medium (3-4)**: Balanced - recommended default
- **Higher (5+)**: Faster but more CPU/memory/network usage

### Environment-Specific Settings

**Development**: `maxConcurrency = 2` (lower resource usage)
**Production**: `maxConcurrency = 3-5` (optimal performance)
**High-Load**: `maxConcurrency = 1` (fallback to sequential if needed)

## Database Safety Mechanisms

### WAL Mode Protection

**Row-Level Granularity**:
- Domain A updates rows WHERE domain='A'
- Domain B updates rows WHERE domain='B'
- **No conflict** - different row sets

**Concurrent Operations**:
- Read keyword data (any time)
- Write keyword updates (domain-specific)
- Update domain stats (protected by domain lock)

### Busy Timeout Protection

**Handles Shared Resources**:
- `failed_queue.json` file updates
- Domain statistics calculations
- Sequelize internal operations

**5-Second Window**:
- Sufficient for quick file I/O
- Prevents immediate failures on contention
- Logs warnings if timeout exceeded

## Monitoring

### Queue Status API

```typescript
const status = refreshQueue.getStatus();
// Returns:
{
  queueLength: 2,           // Tasks waiting
  activeProcesses: 3,       // Tasks running
  activeDomains: ['a', 'b', 'c'],  // Locked domains
  pendingTaskIds: [...],    // Queued task IDs
  maxConcurrency: 3         // Current limit
}
```

### Log Monitoring

**Starting Tasks**:
```
grep "Starting refresh task" logs/app.log
```

**Completing Tasks**:
```
grep "Completed refresh task" logs/app.log | grep -o "(.*ms)"
```

**Domain Locks**:
```
grep "activeDomains" logs/app.log
```

**Parallel Execution**:
```
grep "Starting refresh task" logs/app.log | grep timestamp
# Look for overlapping timestamps
```

## Testing

### Unit Tests

**Parallel Execution Test**:
```typescript
it('processes tasks in parallel up to maxConcurrency')
```

**Per-Domain Locking Test**:
```typescript
it('respects per-domain locking')
```

**Error Handling Test**:
```typescript
it('continues processing after task failure')
```

### Integration Testing

1. **Trigger cron with multiple domains**
2. **Check logs for parallel execution** (overlapping timestamps)
3. **Verify no duplicate domain processing**
4. **Confirm faster total execution time**

## Troubleshooting

### Issue: Domains Not Processing in Parallel

**Check**:
```typescript
refreshQueue.getStatus()
```

**Possible Causes**:
- maxConcurrency set to 1
- All domains have same name (unlikely)
- Queue busy with other tasks

### Issue: Database Locked Errors

**Check WAL Mode**:
```sql
PRAGMA journal_mode;  -- Should return 'wal'
```

**Possible Causes**:
- WAL not supported on filesystem (network drives)
- Database file permissions issue
- busy_timeout too low

**Solution**:
- Check logs for WAL enable warnings
- Verify file permissions
- Increase busy_timeout if needed

### Issue: Slow Performance Despite Parallelism

**Check**:
- Individual domain processing times
- Network/API rate limits
- Scraper type (some force sequential)

**Solutions**:
- Increase maxConcurrency if resources allow
- Optimize scraper delays
- Check for scraper-level bottlenecks

## Best Practices

### Resource Management

1. **Monitor System Resources**: CPU, memory, network during parallel processing
2. **Adjust Concurrency**: Based on observed resource usage
3. **Use Delays Wisely**: scrape_delay applies per-domain, not globally

### Error Handling

1. **Log All Failures**: Queue logs failures without stopping
2. **Monitor Failed Tasks**: Check logs for repeated failures
3. **Clear Stuck Locks**: Queue automatically clears locks on completion/error

### Production Deployment

1. **Start Conservative**: Begin with maxConcurrency=2
2. **Monitor Performance**: Track processing times and resource usage
3. **Gradually Increase**: Bump to 3-5 based on capacity
4. **Set Alerts**: Alert on queue backup or timeout errors

## Future Enhancements

Potential improvements:

1. **Dynamic Concurrency**: Adjust based on system load
2. **Priority Queue**: High-priority domains process first
3. **Resource Quotas**: Per-domain rate limiting
4. **Distributed Queue**: Support multi-host deployments
5. **Queue Persistence**: Survive restarts with pending tasks

## Related Files

- `utils/refreshQueue.ts` - Parallel queue with per-domain locking
- `database/sqlite-dialect.js` - WAL mode and busy_timeout configuration
- `pages/api/cron.ts` - Cron endpoint with parallel enqueueing
- `pages/api/refresh.ts` - Manual refresh with domain locking
- `utils/refresh.ts` - Core keyword refresh logic with immediate DB updates
- `__tests__/utils/refreshQueue.test.ts` - Queue functionality tests

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
