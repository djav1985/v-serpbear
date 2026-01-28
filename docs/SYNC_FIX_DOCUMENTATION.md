# Database and In-Memory Synchronization Fixes

## Overview

This document describes the synchronization issues found in the cron and manual keyword refresh operations and the fixes applied to ensure database and in-memory state remain consistent.

## Issues Identified

### 1. Redundant `keyword.set()` Calls After Database Updates

**Problem**: Throughout the codebase, after calling `keyword.update()` to save changes to the database, code was also calling `keyword.set()` to manually update the in-memory Sequelize model instance. This pattern is problematic because:

- It creates two separate sources of truth for model state
- The manual `.set()` call could contain different values than what was actually saved to the database
- In concurrent scenarios, the in-memory state could diverge from the database
- Sequelize's `.update()` method already handles updating the model instance

**Locations Fixed**:
- `utils/refresh.ts` - `clearKeywordUpdatingFlags()` function
- `utils/refresh.ts` - `refreshAndUpdateKeyword()` function (error handling)
- `utils/refresh.ts` - `updateKeywordPosition()` function
- `pages/api/refresh.ts` - skipped keywords cleanup
- `pages/api/refresh.ts` - keyword initialization before refresh
- `pages/api/refresh.ts` - error cleanup in queue handler
- `pages/api/cron.ts` - keyword initialization before refresh
- `pages/api/cron.ts` - error cleanup in processSingleDomain

**Fix**: Removed all `keyword.set()` calls and replaced the pattern with:
```typescript
// Before (problematic):
await keyword.update(data);
keyword.set(data);

// After (correct):
await keyword.update(data);
if (typeof keyword.reload === 'function') {
  await keyword.reload();
}
```

### 2. Missing Model Reload After Updates

**Problem**: After calling `keyword.update()`, the in-memory Sequelize model instance may not immediately reflect the exact database state, especially when:

- Database triggers or default values are applied
- Other processes have modified the same row
- Complex update operations involve multiple fields

**Fix**: Added `keyword.reload()` calls after all `keyword.update()` operations to explicitly sync the in-memory model with the database.

### 3. Stale Domain Stats Calculation

**Problem**: The `updateDomainStats()` function queries all keywords for a domain to calculate aggregate statistics. However, if keywords were just updated in parallel, the freshly fetched keyword models might still reflect cached state.

**Fix**: Added a reload pass after fetching keywords to ensure we're calculating stats from current database state.

## Testing

### New Tests Added

Created `__tests__/utils/refresh-sync.test.ts` with comprehensive tests (5 tests covering synchronization behavior).

### Existing Tests Updated

Modified `__tests__/utils/refresh.test.ts` to verify the new synchronization pattern is followed.

## Verification

✅ All 596 tests passing  
✅ ESLint passes with no errors  
✅ Production build successful  

## Conclusion

These changes establish a robust synchronization pattern between database and in-memory state for keyword refresh operations. The new pattern (`.update()` + `.reload()` instead of `.update()` + `.set()`) should be followed for all future database update operations.
