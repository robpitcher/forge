# Decision: Rich Status Bar Tooltip with CLI Info

**Author:** Blair  
**Date:** 2026-03-08  
**Status:** Implemented

## Context

The Forge status bar item previously showed plain-string tooltips for auth state only. Users debugging CLI/SDK version mismatches had no way to see the resolved CLI path or version from the status bar.

## Decision

The status bar tooltip is now a `vscode.MarkdownString` with `supportThemeIcons = true`, displaying both auth and CLI state:

```
Forge Status
---
**Auth:** $(pass) user@example.com (Entra ID)
**CLI:** $(check) v0.1.26
**Path:** `/usr/local/bin/copilot`
```

## Implementation

- `ChatViewProvider` owns tooltip building via `_buildStatusBarTooltip()` and `_rebuildTooltip()`.
- The status bar item reference is passed to the provider at activation via `setStatusBarItem()`.
- `updateAuthStatus()` (module-level function) calls `provider.updateTooltipAuthState()` instead of setting `statusBarItem.tooltip` directly.
- `postCliStatus()` calls `_rebuildTooltip()` so the tooltip updates whenever CLI state changes.
- Gracefully handles "not yet checked" state by showing "$(sync~spin) Checking...".

## Rationale

- Keeping tooltip logic on the provider (which already owns `_lastCliValidation`) avoids threading both auth state AND CLI state through `updateAuthStatus()` parameters.
- Using `MarkdownString` instead of plain strings enables codicons, bold labels, and inline code for paths.
- No status bar text was changed — only the tooltip is enriched.
