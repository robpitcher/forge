# Session: Marketplace Pre-Release Publishing Setup

**Date:** 2026-03-04T15:04:00Z  
**Topic:** insider-release.yml marketplace publishing  
**Team:** Palmer, Fuchs, Coordinator

## Overview

Extended the insider build workflow to publish pre-release versions to VS Code Marketplace. Implemented dual-version strategy: GitHub releases use semantic versioning with commit context, marketplace uses run_number for unique numeric versions.

## Work Done

- Palmer: insider-release.yml marketplace publishing steps, vscode:prepublish script, dual-version strategy
- Fuchs: CHANGELOG.md v0.2.0 initial entry
- Coordinator: Date correction in CHANGELOG, .vscodeignore repoheader.png exclusion, build/test/package verification

## Key Decisions

1. Marketplace versions use `{major}.{minor}.{run_number}` for uniqueness
2. GitHub Release tags remain `{version}-insider+{short-sha}` for traceability
3. Marketplace publish failures non-blocking (continue-on-error: true)

## Status

✅ Complete. All artifacts passing verification.
