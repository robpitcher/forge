# Session Log: Release Branch & PR

**Date:** 2026-02-27T05:21:00Z  
**Agent:** Childs (SDK Dev)

## What Happened

Created release branch `rel/0.2.0` from `dev`. Stripped `.squad/` (34 files removed, `.gitignore` updated). Pushed branch and opened PR #30 to main. Returned to dev.

## Why

Rob Pitcher's branching directive: main is protected. Only human-merged PRs allowed. Release branches use `rel/` prefix and must exclude `.squad/` to keep main clean and enable CI workflows.

## Outcome

- PR #30 ready for human review
- Squad state remains on dev
- Next: Rob reviews and squash-merges
