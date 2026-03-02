# Session: PR #115 CI Workflow Fixes — 2026-03-02T13:16:15Z

**Requested by:** Rob Pitcher  
**Topic:** PR #115 CI workflow fixes

## Work Completed

**Palmer (DevOps):** Added `ready_for_review` to ci.yml PR event triggers.  
**Windows (Tester):** Fixed lint errors (unused imports, stale eslint-disable comments).  
**Coordinator:** Commented on PR #115 explaining squad-ci.yml overlap is not being narrowed (old workflow is broken, new ci.yml replaces it).

## Decisions Merged
- `palmer-ci-ready-for-review.md` → decisions.md (duplicate of existing ci.yml decision, consolidated)
- `windows-gettext-mock.md` → decisions.md (getText argument-aware mocks decision)

## Outcome
✅ CI workflow fixes complete. All squad member executions successful.
