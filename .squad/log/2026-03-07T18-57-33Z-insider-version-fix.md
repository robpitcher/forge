# Session Log: Insider Version Fix

**Timestamp:** 2026-03-07T18:57:33Z  
**Agent:** Palmer (DevOps Specialist)  
**Duration:** Complete

## What Happened

Removed marketplace publishing from `insider-release.yml`. Insider builds now create GitHub Releases only (no marketplace bloat).

## Changes

- `.github/workflows/insider-release.yml`: Removed "Compute marketplace version" and "Publish to VS Code Marketplace" steps
- `VSCE_PAT` secret reference removed

## Decision

Marketplace reserved for stable releases (semver). Insider releases use GitHub Releases with `{version}-insider+{sha}` tagging.

## Files Modified

- `.github/workflows/insider-release.yml`

## Approval

✅ Rob Pitcher (Project Owner)
