# Air-Gap Validation Testing Strategy

**Date:** 2026-02-27  
**Author:** Windows (Tester)  
**Context:** Issue #11 — Test air-gap validation (SC2, SC3)

---

## Decision

Air-gap validation cannot be tested through manual network disconnection in unit tests. Instead, implemented **static code analysis and configuration inspection tests** that verify:

1. **Source code analysis**: All source modules (configuration.ts, copilotService.ts, extension.ts) are free of GitHub API endpoint references
2. **No GitHub authentication**: No GITHUB_TOKEN environment variable access or GitHub-specific configuration
3. **Azure-only endpoint**: CopilotClient sessions are configured exclusively with user-provided Azure AI Foundry endpoint
4. **No external HTTP calls**: Source code contains no direct fetch/axios/http.request calls (only SDK usage)
5. **Settings schema**: Extension contributes only enclave.copilot.* settings with no GitHub-related properties
6. **Provider type**: Sessions use OpenAI-compatible provider with Azure baseUrl

---

## Implementation

Created `src/test/air-gap-validation.test.ts` with 18 tests organized in 7 test suites:
- No GitHub API endpoint references (3 tests)
- No GITHUB_TOKEN dependency (3 tests)
- Azure AI Foundry-only configuration (3 tests)
- Chat functionality without GitHub config (3 tests)
- Extension settings schema compliance (2 tests)
- Provider configuration validation (2 tests)
- No external network calls (2 tests)

---

## Rationale

**Why static analysis over dynamic network testing:**
- Unit tests run in Node.js process without real VS Code environment
- Simulating network disconnection is unreliable and non-portable
- Static analysis catches violations at test time, not runtime
- Prevents accidental introduction of GitHub API dependencies in future changes
- Validates architecture intent: extension is designed for air-gap, not just works in air-gap

**What we validate:**
- ✅ Code doesn't reference GitHub endpoints (string matching on function source)
- ✅ Configuration reads only from enclave.copilot.* namespace
- ✅ Session config passes only Azure endpoint to SDK
- ✅ No HTTP libraries imported for direct calls

**What we don't validate:**
- ❌ Actual network traffic (requires integration test with real environment)
- ❌ SDK internal behavior (SDK is external dependency; we trust it honors provider config)
- ❌ VS Code platform network isolation (manual test responsibility)

---

## What This Enables

1. **Regression protection**: If someone adds `fetch("https://api.github.com/...")`, tests fail
2. **Architectural compliance**: Enforces design constraint that extension is Azure-only
3. **Continuous validation**: Runs in CI on every commit
4. **Documentation as code**: Tests serve as executable specification of air-gap requirements

---

## Manual Testing Still Required

Automated tests validate code structure, but **manual validation** per issue acceptance criteria is still needed:
- Disconnect network (simulated air-gap)
- Unset GITHUB_TOKEN
- Verify extension activates and chat works
- Use network inspection to confirm zero GitHub API calls

This is complementary to automated tests: automation prevents mistakes, manual testing confirms real-world behavior.

---

## References

- Issue: #11
- PR: #47
- Test file: `src/test/air-gap-validation.test.ts`
- Success Criteria: SC2 (no GitHub auth), SC3 (no GitHub API calls)
