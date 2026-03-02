### API Key Storage Must Sync authMethod Setting
**By:** Blair
**When:** 2026-02-28
**What:** When storing an API key via `_promptAndStoreApiKey()`, the extension now also updates `forge.copilot.authMethod` to `"apiKey"` (Global scope). When clearing via `_clearApiKey()`, it reverts to `"entraId"`. This ensures `checkAuthStatus` evaluates the correct credential type. Any future code path that programmatically sets/clears an API key must maintain this invariant.
**Why:** Without this sync, `checkAuthStatus` always evaluated Entra ID auth (the default), making the welcome screen stuck after API key entry.
