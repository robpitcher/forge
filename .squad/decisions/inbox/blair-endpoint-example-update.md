### Update endpoint example URL to services.ai.azure.com
**By:** Blair
**Date:** 2025-07-24
**What:** Updated user-facing example endpoint URL from `https://myresource.openai.azure.com/` to `https://myresource.services.ai.azure.com/` in `package.json` settings description and `src/configuration.ts` validation error message. The `isAzure` regex (`/\.azure\.com/i`) was intentionally left unchanged — it matches both formats, so no logic change was needed. This is a docs-only change to reflect Azure AI Foundry's current generic endpoint format.
**Why:** Azure AI Foundry now uses `services.ai.azure.com` as the standard endpoint format. The old `openai.azure.com` still works but is no longer the recommended example for new users.
