# AGENTS.md

## Purpose
This document defines baseline expectations for all contributors to maintain code quality, test coverage, and project stability.

---

## Quick Reference

- Add tests to an applicable existing suite when practical.
---

## Final Touches Guidelines

- [ ] Full test suite passes locally
- [ ] Linting and formatting tools run locally
- [ ] All linting and formatting issues fixed
- [ ] CHANGELOG.md updated for every change
- [ ] README.md updated whenever a change makes its content inaccurate
- [ ] docs/ updated whenever a change makes its content inaccurate or is the kind of change that should be documented

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
