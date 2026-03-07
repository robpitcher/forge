# Session Log — Release Workflow Fix

**Date:** 2026-03-05T13:40:00Z  
**Agent:** Palmer (DevOps)  
**Branch:** copilot/update-release-workflow-for-vscode-marketplace

## Work Done

Fixed release.yml marketplace publish:
- Moved version read before package step (so --out can use $VERSION)
- Changed bare vsce publish to vsce publish --packagePath for deterministic artifact publishing

## Decision

**Principle:** Build once, publish everywhere. Same .vsix: GitHub Release → Marketplace.

## Commits

- 6fe3e19: Fixed stable release marketplace publish step

