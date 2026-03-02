# Decision: Add `ready_for_review` to CI PR triggers

**Author:** Palmer (DevOps Specialist)
**Date:** 2025-07-14
**Issue:** #104

## Context
The new `ci.yml` workflow (replacing the broken `squad-ci.yml`) only triggered on `opened`, `synchronize`, and `reopened` PR events. This meant draft PRs marked ready for review would not get a CI run, leaving reviewers without build/test validation.

## Decision
Add `ready_for_review` to the `pull_request.types` array in `.github/workflows/ci.yml`. The full set is now: `[opened, synchronize, reopened, ready_for_review]`.

## Rationale
- Draft → ready is a common workflow; CI must validate before review begins.
- GitHub Actions does not re-run on `ready_for_review` unless explicitly listed.
- No performance concern — it's the same pipeline, just triggered on one additional event type.

## Impact
All PRs targeting `dev` or `main` will now get CI validation when moved out of draft status.
