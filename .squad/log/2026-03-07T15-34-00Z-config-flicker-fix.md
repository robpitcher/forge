# Session Log: Config Flicker Fix

**Date:** 2026-03-07 15:34:00 UTC  
**Agent:** Blair (Extension Dev)

## Worked

Fixed UI flicker in `ChatViewProvider._sendConfigStatus()` by caching auth state between async checks instead of hardcoding `hasAuth: false`.

## Changes

- `src/extension.ts` — Added `_lastKnownHasAuth` field, updated preliminary configStatus logic

## Tests

- All 315 pass, typecheck clean

## Decision

Established pattern: use cached state for optimistic/preliminary messages to prevent UI flicker on repeat calls.
