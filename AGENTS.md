# AGENTS.md

## Purpose
This document defines baseline expectations for all contributors to maintain code quality, test coverage, and project stability.

> **📖 For technical documentation and architecture details, see [.github/copilot-instructions.md](.github/copilot-instructions.md)**

---

## Quick Reference

### Essential Reading
1. **Architecture & Patterns:** [.github/copilot-instructions.md](.github/copilot-instructions.md)
2. **Requirements:** Node.js 20.18.1 (check `.nvmrc`)
3. **Setup:** `npm ci && npm run db:migrate`
4. **Development:** `npm run start:all` (web + cron worker)
5. **Testing:** `npm test` (Jest + happy-dom)

### Key Conventions
- **API routes:** Wrap with `withApiLogging` + `verifyUser` middleware
- **Database:** Use `toDbBool()`/`fromDbBool()` for boolean fields (stored as 0/1)
- **JSON fields:** Must `.get({ plain: true })` before API responses
- **Tests:** Use helpers from `__tests__/__helpers__/` (never re-roll mocks)
- **Linting:** No trailing commas in configs (enforced)

---

## Testing Requirements

### Every change MUST include tests

**For API routes:**
- ✓ 401 when not authorized
- ✓ 405 for wrong HTTP method
- ✓ 400 for missing/invalid params
- ✓ 404 when resource not found
- ✓ 200/201 for success cases
- ✓ Error handling (database errors, validation errors)

**For utilities:**
- ✓ Core functionality with valid inputs
- ✓ Edge cases (empty, null, undefined)
- ✓ Error conditions

**Test patterns:**
- Mock dependencies at file top (before imports)
- Use `createMockRequest()` and `createMockResponse()` for API tests
- Always `jest.clearAllMocks()` in beforeEach
- Save/restore environment variables in afterEach

See [.github/copilot-instructions.md](.github/copilot-instructions.md#testing-patterns) for detailed testing patterns.

---

## Code Quality Standards

### Before Committing
```bash
npm run lint           # ESLint check
npm run lint:css       # Stylelint check
npm test               # Full test suite
```

### API Route Pattern
```typescript
export default withApiLogging(async (req, res) => {
  const authorized = verifyUser(req, res);
  if (authorized !== 'authorized') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Validate input
  // Query database
  // Return response
});
```

### Database Queries
```typescript
// Always get plain objects for API responses
const domain = await Domain.findOne({ where: { domain: 'example.com' } });
if (!domain) return res.status(404).json({ error: 'Not found' });

const plainDomain = domain.get({ plain: true });
// Convert booleans: toDbBool(true) → 1, fromDbBool(1) → true
```

### Migrations
```typescript
// ALWAYS check table existence
const [results] = await queryInterface.sequelize.query(
  `SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'`,
  { transaction: t }
);
if (results.length === 0) return;

// ALWAYS wrap in transaction
return queryInterface.sequelize.transaction(async (t) => {
  // Your changes here
});
```

---

## Final Touches Guidelines

- [ ] Full test suite passes locally  
- [ ] Linting and formatting tools run locally  
- [ ] All linting and formatting issues fixed   
- [ ] CHANGELOG.md updated (if applicable)  
- [ ] README.md updated (if applicable)  
- [ ] Pull request includes a concise summary of what changed and why  

---

## Notes
These are baseline expectations—projects may have additional requirements documented elsewhere. Always follow the most restrictive applicable rules.
