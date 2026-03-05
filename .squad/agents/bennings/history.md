# Bennings — History

## Project Context

**Forge** is a VS Code extension providing AI chat for air-gapped environments via Azure AI Foundry. Built with TypeScript, VS Code Extension API, and `@github/copilot-sdk` in BYOK mode. Owner: Rob Pitcher.

**Stack:** TypeScript · VS Code Extension API · @github/copilot-sdk · esbuild · vitest

**Key Azure touchpoints:**
- Azure AI Foundry endpoint (configurable via `forge.copilot.endpoint`)
- Entra ID authentication via `DefaultAzureCredential` (or API key fallback)
- Enterprise architecture doc at `docs/enterprise-architecture.md`

## Learnings

- **Auth ownership:** The Extension Host (not the Copilot CLI) acquires Entra ID tokens via `DefaultAzureCredential`. The CLI receives a static `bearerToken` string. This is defined in `src/auth/credentialProvider.ts` and consumed in `src/copilotService.ts:buildProviderConfig()`.
- **Provider type detection:** `buildProviderConfig()` in `src/copilotService.ts:453` auto-detects `type: "azure"` for `.azure.com` endpoints. This means the enterprise doc must NOT include `/openai/v1/` in `baseUrl` — the SDK appends it.
- **Token scope:** The credential provider uses `https://cognitiveservices.azure.com/.default` (defined in `src/auth/credentialProvider.ts:5-6`). This is the correct scope for Azure AI Foundry / Azure OpenAI Service.
- **APIM Premium required:** VNet injection for air-gap deployments requires APIM Premium tier. This is a significant cost factor (~$2,800/mo classic, ~$700/mo v2) that must be documented in any enterprise guidance.
- **One Private Endpoint for AI Foundry only:** APIM→AI Foundry traffic needs PE. Client→APIM does NOT need a separate PE because VNet-injected APIM (internal mode) already provides private IP access within the VNet. VNet injection and inbound Private Endpoint are separate networking models per Microsoft Learn; we use injection for air-gap.
- **Token refresh limitation (issue #27):** `bearerToken` in the SDK is a static string. Tokens expire after ~1hr. Session-per-conversation mitigates this since a fresh token is acquired at session creation.
- **Key file paths for enterprise architecture:** `docs/enterprise-architecture.md` (reference architecture), `src/auth/credentialProvider.ts` (auth flow), `src/copilotService.ts` (BYOK provider config), `src/configuration.ts` (settings including `authMethod`).
- **Azure API version:** The code pins `apiVersion: "2024-10-21"` for Azure endpoints (`src/copilotService.ts:461`). Enterprise docs should note this as it affects which models/features are available.
- **APIM VNet injection vs inbound Private Endpoint:** Microsoft Learn documents these as separate, alternative networking models. Injection is superior for air-gap (both inbound and outbound control). PE is a fallback for basic tiers or when multiple external access paths are required. For Forge's Premium-tier internal-mode APIM, injection alone suffices.
