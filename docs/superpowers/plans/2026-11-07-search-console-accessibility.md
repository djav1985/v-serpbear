# Search Console Consistency and Frontend Accessibility Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make equivalent Search Console averages consistent and ensure all interactive frontend controls in scope work with keyboard, assistive technology, and pointer input.

**Architecture:** Preserve the existing React/TypeScript components and visual styling. Use one shared Search Console position aggregation rule, native interactive elements where possible, and explicit ARIA keyboard behavior only for custom widgets that need it. Audit the rest of the frontend for the same interaction pattern and repair confirmed instances.

**Tech Stack:** Next.js, React 18, TypeScript, Jest, Testing Library, eslint-plugin-jsx-a11y.

**Spec:** User request in chat: fix the reported Search Console average inconsistency and keyboard accessibility gaps, then look for similar or related errors throughout the frontend.

## Global Constraints

- Keep the current user-facing layout and mouse/touch interactions.
- Use impressions-weighted average position when combining Search Console rows or days; use the existing zero-impressions fallback consistently.
- Prefer native `button`, `input`, `select`, and link semantics over clickable generic elements.
- Every control must have an accessible name, visible focus indication, and correct disabled/expanded/selected state when applicable.
- Do not add a dependency unless native HTML/ARIA patterns cannot meet the requirement.
- Treat non-interactive containers as non-interactive; where chart or row activation is necessary, provide a keyboard-accessible control with an accessible name.

## Review Focus

- Uneven impressions across days or rows: weighted average must match the Search Console summary for the same input data and period.
- Zero total impressions and empty datasets: all summaries must use the same documented fallback and avoid `NaN`/infinity.
- Keyboard-only interaction: Tab reaches controls; Enter/Space activates buttons; arrows and Escape behave correctly in any custom listbox.
- Assistive technology state: labels, expanded state, selected state, menu relationships, and dismissal are exposed accurately.
- Responsive and virtualized views: controls remain reachable, visible on focus, and operable at narrow widths and when rows are virtualized.

---

### Task 1: Align Search Console average-position aggregation

**Files:**
- Modify: `utils/domains.ts`
- Inspect/modify: `components/keywords/SCKeywordsTable.tsx`
- Inspect/modify: the domain Search Console summary component identified from its current call site
- Test: `__tests__/utils/domains.test.ts`
- Test: add or extend a component test for the Search Console summary where aggregation is rendered

**Interfaces:**
- Consumes existing daily/row Search Console position and impression values.
- Produces one consistent aggregation rule used by domain overview and keyword summary: `sum(position * impressions) / sum(impressions)`, with the same existing fallback when total impressions are zero.

- [ ] Add a regression test with two days/rows that have different impression counts and verify each equivalent summary returns the impression-weighted value.
- [ ] Add tests for zero total impressions, no rows, and missing/zero-valued data; assert finite and consistent output.
- [ ] Run the focused tests and confirm the weighted-average regression fails against the current domain calculation.
- [ ] Implement or reuse a small typed aggregation helper in `utils/domains.ts` (or the narrowest shared utility already present), then route both summaries through it without changing their date-window selection.
- [ ] Run the focused utility and component tests; confirm the same dataset and date window display the same average in each view.

### Task 2: Make `SelectField` keyboard-operable and labeled

**Files:**
- Modify: `components/common/SelectField.tsx`
- Test: create `__tests__/components/SelectField.test.tsx`

**Interfaces:**
- Keep existing `SelectFieldProps` and `updateField(values: string[])` contract.
- Preserve single and multiple selection, filtering for long option lists, outside-click dismissal, and current visual styling.

- [ ] Add tests for accessible trigger name, Tab focus, Enter/Space open and close, Escape dismissal with focus returned to trigger, and option activation from the keyboard.
- [ ] Add tests for single-select close-on-choice, multi-select toggle behavior, and filtering without losing keyboard access.
- [ ] Run the focused tests and confirm the keyboard interaction tests fail before implementation.
- [ ] Replace the clickable trigger `div` with a `button type="button"`; connect the optional visible label through `aria-label`/`aria-labelledby`, and expose `aria-expanded` and `aria-controls`.
- [ ] Implement a coherent option interaction model: either native checkbox/button controls inside the list, or a complete listbox pattern with roles, focus management, arrow navigation, Home/End, Enter/Space, and selected state. Do not mix partial listbox roles with native controls.
- [ ] Give the filter input a programmatic label, preserve focus on filtering, and ensure Escape closes the popup predictably.
- [ ] Verify pointer operation, focus ring, long-list filtering, empty-state messaging, flags, and multiple selection remain intact.

### Task 3: Repair keyword row details and action controls

**Files:**
- Modify: `components/keywords/Keyword.tsx`
- Test: `__tests__/components/Keyword.test.tsx`

**Interfaces:**
- Preserve the existing callbacks: `showKeywordDetails`, `refreshkeyword`, `favoriteKeyword`, `manageTags`, `removeKeyword`, and `selectKeyword`.

- [ ] Add tests proving the keyword details control and every menu action can be focused and activated with Enter/Space, and that the menu trigger exposes its expanded state and accessible name.
- [ ] Replace the no-`href` keyword-details anchor with a button, retaining the current layout and title text.
- [ ] Replace no-`href` action anchors with `button type="button"` controls and preserve action ordering and menu dismissal.
- [ ] Add an accessible menu trigger name and `aria-expanded`/`aria-controls`; if retaining `role="menu"`, implement the corresponding menu keyboard model (arrow navigation, Home/End, Escape, focus return). Otherwise use a simple labeled popup containing ordinary buttons and standard Tab navigation.
- [ ] Add accessible names to icon-only controls (select keyword, favorite, update error, close error) and ensure all state-changing buttons explicitly use `type="button"`.
- [ ] Run focused tests for mouse and keyboard operation, including removal/favorite actions, and verify no click fires twice.

### Task 4: Audit and fix related frontend interaction patterns

**Files:**
- Inspect frontend `.tsx` files under `components/` and `pages/`.
- Modify only files with confirmed actionable accessibility defects.
- Add/extend tests in matching `__tests__/components/` or page tests.

- [ ] Search for `onClick` on non-interactive elements (`div`, `span`, `li`, `i`, SVG wrappers) and anchors without `href`; classify each as decorative, container-only, or an actual user control.
- [ ] Search for icon-only buttons, controls with missing labels, missing button types, focus traps, and conditional controls removed from keyboard navigation.
- [ ] For each actual control, add a focused regression test for keyboard reachability and activation before changing markup.
- [ ] Convert simple actions to native buttons; convert navigation to real links; provide keyboard semantics and focus management only for components that must remain custom.
- [ ] Check all `SelectField` call sites for visible labels or a meaningful `aria-label`, including filters, settings, modals, keyword research, and domain pages.
- [ ] Check virtualized keyword rows and responsive-only controls for correct tab order, focus visibility, and accessible names.
- [ ] Run the accessibility-focused tests and lint rules; record any remaining intentional non-interactive `onClick` handlers and why they are not user controls.

### Task 5: Final verification and review

**Files:**
- No planned production changes; adjust the affected tests if findings require it.

- [ ] Run focused tests for Search Console aggregation, `SelectField`, `Keyword`, and each audited component.
- [ ] Run the full Jest suite and ESLint after focused tests pass.
- [ ] Manually verify with keyboard at desktop and narrow viewport: tab order, visible focus, open/close behavior, selection, menu actions, and focus return.
- [ ] Verify screen-reader names and state for selectors, keyword detail activation, and menus using the project's available browser/manual accessibility tooling.
- [ ] Review the final diff for unchanged callback contracts, no duplicate activation, no regressions in mouse/touch behavior, and no newly introduced inaccessible controls.
