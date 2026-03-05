# Decision: Enterprise Architecture Documentation Overhaul

**Date:** 2025-07-17
**Author:** Bennings (Azure Cloud Architect)
**Artifacts:** `docs/enterprise-architecture.md`
**Status:** Complete

## Summary

Reviewed and corrected the enterprise architecture reference documentation. Found 6 significant issues and multiple minor gaps. All corrections applied directly to `docs/enterprise-architecture.md`.

## Issues Found & Corrected

### Critical

1. **Auth flow was wrong.** The diagram showed the Copilot CLI authenticating with Entra ID. In reality, the **Extension Host** acquires the token via `DefaultAzureCredential.getToken()` and passes it as a static `bearerToken` to the CLI. The CLI never talks to Entra ID. Fixed the diagram and auth flow section.

2. **Private Endpoint topology was incomplete.** Only one PE was shown, placed between VNet and APIM with ambiguous direction. Enterprise deployments need **two** Private Endpoints: one for clients to reach APIM, and one for APIM to reach AI Foundry. Both are now in the diagram.

3. **Missing client-to-VNet connectivity.** The original diagram had no VPN Gateway or ExpressRoute — leaving the question of how on-prem clients reach the private network unanswered. Added VPN Gateway/ExpressRoute to the diagram and networking section.

### Moderate

4. **Missing Key Vault.** Enterprise deployments need Key Vault for API keys, certs, and APIM policy secrets. Added to diagram and component table.

5. **Missing Private DNS Zones.** Critical for PE resolution. Were mentioned in notes but absent from diagram. Now a first-class component.

6. **APIM tier not specified.** VNet injection requires Premium tier (or v2). Original doc said "APIM auto-scales" which is misleading. Added tier comparison table and cost context.

7. **APIM → AI Foundry auth via managed identity.** The original doc didn't mention how APIM authenticates to the backend. Added managed identity pattern (no keys to rotate).

### Minor

8. **Token Endpoint was a misleading separate node.** Removed — it's just Entra ID's OAuth endpoint.
9. **App Insights attribution corrected.** AI Foundry doesn't natively emit to App Insights. Diagnostic settings go to Log Analytics. App Insights is for optional client-side telemetry.
10. **Added APIM policy details** with actual policy names (`validate-jwt`, `rate-limit-by-key`, `authentication-managed-identity`, etc.).
11. **Added token refresh limitation note** referencing issue #27.

## Impact

- Documentation only — no code changes.
- All squad members referencing the enterprise architecture should use the updated doc.
- The auth flow correction is important for Blair/Childs to understand: the extension host owns authentication, the CLI is a passive consumer of the token.
