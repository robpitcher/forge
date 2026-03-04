# Decision: Proactive az CLI detection in forge.signIn

**Author:** Blair (Extension Dev)
**Date:** 2025-07-17
**Scope:** `src/extension.ts` — `forge.signIn` command handler

## Context

When a new user configures Entra ID auth and clicks "Sign in with Entra ID", the extension previously opened a terminal and ran `az login` unconditionally. If `az` CLI wasn't installed, the user saw a confusing shell error.

## Decision

Add a proactive `az` CLI availability check **before** opening the terminal:

- Use `execFileSync` with `which` (POSIX) / `where.exe` (Windows) to detect `az` on PATH.
- If not found, show `showErrorMessage` with an "Install Azure CLI" button linking to `https://aka.ms/installazurecli`.
- Return early — no terminal opened.

## Rationale

- **Actionable errors** — user immediately knows what's wrong and how to fix it.
- **Security** — `execFileSync` avoids shell injection (`execSync` banned by convention).
- **Complementary** — this is the PROACTIVE guard (pre-launch). `isCliNotFoundError` in `authStatusProvider.ts` remains the REACTIVE guard (post-token-fetch failure).
- **Cross-platform** — `where.exe` on Windows, `which` on macOS/Linux.

## Impact

- Blair owns `src/extension.ts` — no cross-domain impact.
- No test changes required (existing 67+ tests unaffected).
