Here’s the updated AGENTS.md with a Doc Sync note so contributors know to check all public-facing docs together when changes happen:

# AGENTS.md

## Purpose
This document defines baseline expectations for all contributors to maintain code quality, test coverage, and project stability.

---

## Development Guidelines

### 1. Testing Requirements
- **Always update or create tests** for any feature, bug fix, or refactor.
- Place new tests in the project’s designated test directory or add them to the existing test suite.
- Tests should fully cover the changes made, including edge cases.

### 2. Documentation Requirements
- **Update or create a `CHANGELOG.md`** for any notable change.  
  The file should begin with:  
  ```markdown
  # Changelog

  All notable changes to this project will be documented in this file.  
  See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

Update README.md when applicable:
If changes make existing information incorrect, or if new features, usage instructions, or capabilities should be documented, update the README accordingly.
Do not make unnecessary edits—only update when the change affects accuracy or completeness.

Doc Sync:
When making changes that affect documentation, review README.md, CHANGELOG.md, and any other public-facing docs at the same time to ensure consistency.


3. Local Verification

Before committing changes:

1. Run all tests
Ensure the full test suite passes locally without errors.


2. Lint the code
Run the project's configured linter(s) or formatting tools.


3. Fix all linting or formatting issues
Use auto-fix tools when available, and manually address any remaining issues.



4. Change Workflow

Implement changes in small, reviewable commits.

Write clear and descriptive commit messages.

Avoid pushing untested or lint-failing code.


5. Pull Request Expectations

PRs must pass all automated checks (tests, linting, builds) before requesting review.

Include a brief summary of the changes and their purpose.

Reference related issues or tickets when applicable.



---

Checklist Before Submitting Code

[ ] Updated or created tests.

[ ] All tests pass locally.

[ ] Linting run with no errors.

[ ] Updated or created CHANGELOG.md with notable changes.

[ ] Updated README.md if information is outdated or incomplete.

[ ] Verified documentation consistency (README.md, CHANGELOG.md, other public docs).

[ ] Commit messages are clear.

[ ] PR description explains the "why" and "what."
