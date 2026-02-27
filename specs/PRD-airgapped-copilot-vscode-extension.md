# Product Requirements Document
## Enclave VS Code Chat Extension — MVP / Proof of Concept

**Author:** @robpitcher  
**Date:** 2026-02-27  
**Status:** Draft  
**Version:** 0.2

---

## 1. Executive Summary

Build a VS Code extension that provides a Copilot-like chat experience for **air-gapped environments** — no GitHub authentication, no internet access to GitHub services. The extension uses the **GitHub Copilot SDK** (`@github/copilot-sdk`) in **BYOK (Bring Your Own Key) mode** to route all model inference to a private **Azure AI Foundry** endpoint. The Copilot CLI runs locally as the agent runtime, providing tool execution, session management, and streaming — while the VS Code Chat Participant API provides the native chat panel UI.

This MVP is a **proof of concept** to validate that the architecture works end-to-end in a disconnected environment before investing in additional features.

---

## 2. Problem Statement

Organizations operating in air-gapped or restricted network environments need an AI-powered coding assistant experience inside VS Code but cannot use GitHub Copilot directly because:

- No outbound connectivity to GitHub APIs
- No GitHub authentication flow available
- All model inference must go through a controlled, private Azure AI Foundry deployment
- Security and compliance requirements mandate that no data leaves the private network

Forking `microsoft/vscode-copilot-chat` was evaluated and rejected due to extreme maintenance cost and tight coupling to GitHub authentication.

---

## 3. Goals & Non-Goals

### Goals (MVP)

| # | Goal |
|---|------|
| G1 | Users can open a chat panel in VS Code and converse with an AI model — identical UX to the native Copilot Chat sidebar |
| G2 | All model inference is routed exclusively to a configured Azure AI Foundry endpoint (private network) |
| G3 | Zero GitHub authentication — the extension works without any GitHub account, token, or internet connectivity to GitHub |
| G4 | Streaming responses — tokens appear incrementally in the chat panel as they are generated |
| G5 | Configurable via VS Code settings — endpoint URL, API key (or Managed Identity bearer token), and model name |
| G6 | Basic error handling — connection failures, auth errors, and model errors display user-friendly messages in the chat panel |
| G7 | Extension is distributable as a `.vsix` file for sideloading onto air-gapped machines |

### Non-Goals (deferred to future iterations)

| # | Non-Goal |
|---|----------|
| NG1 | Inline code completions (ghost text) |
| NG2 | Custom tools (file system, git, web requests) — the Copilot CLI's built-in tools will be disabled for MVP to reduce surface area |
| NG3 | Multi-turn context from the active editor/workspace (file references, `@workspace`) |
| NG4 | Session persistence / conversation history across VS Code restarts |
| NG5 | Multiple concurrent sessions |
| NG6 | Slash commands (e.g., `/explain`, `/fix`, `/tests`) |
| NG7 | Code actions (inline chat, Quick Fix integrations) |
| NG8 | Azure Managed Identity / Entra ID bearer token flow (will use API key for MVP; Managed Identity is a fast-follow) |
| NG9 | Telemetry or usage analytics |
| NG10 | Multiple model endpoints / model picker (deferred to Phase 6) |

---

## 4. Target Users

| Persona | Description |
|---------|-------------|
| **Air-gapped developer** | Software developer working in a classified, regulated, or highly restricted environment with no internet access. Uses VS Code (sideloaded). Needs an AI coding assistant to improve productivity. |
| **Platform / DevOps engineer** | Responsible for deploying and configuring developer tools in the air-gapped environment. Will set up the Azure AI Foundry endpoint and distribute the `.vsix`. |

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      VS Code                              │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Chat Panel (VS Code Chat API)               │  │
│  │   User types prompt → sees streamed markdown reply  │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │                                    │
│  ┌────────────────────▼────────────────────────────────┐  │
│  │         Extension Host (our extension)              │  │
│  │                                                     │  │
│  │   1. Reads config (endpoint, key, model)            │  │
│  │   2. Creates CopilotClient (BYOK mode)              │  │
│  │   3. Creates session with provider config            │  │
│  │   4. Sends prompt, streams deltas to chat panel      │  │
│  │                                                     │  │
│  │   Dependencies:                                      │  │
│  │     - @github/copilot-sdk                            │  │
│  │     - Copilot CLI binary (bundled or on PATH)        │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │ JSON-RPC (stdio)                   │
│  ┌────────────────────▼────────────────────────────────┐  │
│  │         Copilot CLI (server mode, local process)    │  │
│  │         Agent runtime — NO GitHub API calls          │  │
│  └────────────────────┬────────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────┘
                        │ HTTPS (private network)
                        ▼
┌──────────────────────────────────────────────────────────┐
│           Azure AI Foundry (Private Endpoint)             │
│                                                           │
│   Auth: API Key (MVP) / Managed Identity (future)         │
│   Models: GPT-4.1, GPT-5, etc.                           │
│   Network: Private Endpoint / VNET                        │
│                                                           │
│   ⚠ Provisioning & configuration of this endpoint is     │
│     OUT OF SCOPE for this project. It is assumed to       │
│     exist or be provisioned separately.                   │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Functional Requirements

### FR1: Chat Participant Registration

The extension registers a VS Code **Chat Participant** so it appears in the native Copilot Chat panel.

- **Participant ID:** `enclave.copilot`
- **Display Name:** `Enclave` (configurable in future)
- **Icon:** A custom icon or VS Code `ThemeIcon` (e.g., `hubot`)
- **Sticky:** `true` — the participant is the default in the chat panel

### FR2: Copilot SDK Client Lifecycle

- On extension activation, create a `CopilotClient` instance from `@github/copilot-sdk`.
- The client connects to the Copilot CLI via stdio (the SDK manages the CLI process lifecycle automatically).
- The Copilot CLI binary must be available on `PATH` or at a path specified in settings (`enclave.copilot.cliPath`).
- On extension deactivation, gracefully stop the client (`client.stop()`).

### FR3: BYOK Session Creation

When the user sends a chat message, the extension creates (or reuses) a session with BYOK provider configuration:

| Parameter | Source |
|-----------|--------|
| `model` | VS Code setting: `enclave.copilot.model` |
| `provider.type` | `"openai"` (Azure AI Foundry's OpenAI-compatible endpoint) |
| `provider.baseUrl` | VS Code setting: `enclave.copilot.endpoint` |
| `provider.apiKey` | VS Code setting: `enclave.copilot.apiKey` (stored as a string; users should use VS Code's secret storage in production) |
| `provider.wireApi` | VS Code setting: `enclave.copilot.wireApi` (default: `"completions"`) |
| `streaming` | `true` |

### FR4: Streaming Response Rendering

- Subscribe to `assistant.message_delta` events from the session.
- Write each delta to the VS Code `ChatResponseStream` using `stream.markdown()`.
- On `session.idle`, the response is complete.
- On `session.error`, display the error message in the chat panel.

### FR5: Session Reuse Within a Chat Conversation

- For the duration of a single VS Code chat "thread" (one chat panel conversation), reuse the same Copilot SDK session to maintain conversational context.
- If the user starts a new conversation (new chat panel), create a new session.

### FR6: Configuration Settings

The extension contributes the following VS Code settings:

| Setting | Type | Required | Default | Description |
|---------|------|----------|---------|-------------|
| `enclave.copilot.endpoint` | `string` | Yes | `""` | Azure AI Foundry endpoint URL (e.g., `https://myresource.openai.azure.com/openai/v1/`) |
| `enclave.copilot.apiKey` | `string` | Yes | `""` | API key for the Azure AI Foundry endpoint |
| `enclave.copilot.model` | `string` | Yes | `"gpt-4.1"` | Model deployment name |
| `enclave.copilot.wireApi` | `string` | No | `"completions"` | API format: `"completions"` or `"responses"` |
| `enclave.copilot.cliPath` | `string` | No | `""` | Path to Copilot CLI binary (if not on PATH) |

### FR7: Error Handling

| Error Condition | Behavior |
|-----------------|----------|
| Missing configuration (endpoint or API key) | Display actionable error in chat: *"Please configure the Azure AI Foundry endpoint in Settings (enclave.copilot.endpoint)"* with a button to open settings |
| Copilot CLI not found | Display error: *"Copilot CLI not found. Please install it or set the path in enclave.copilot.cliPath"* |
| Network / connection error to Azure AI Foundry | Display error in chat response stream |
| Authentication error (invalid API key) | Display error in chat response stream |
| User cancels request (VS Code cancellation token) | Call `session.abort()` to cancel the in-flight request |

### FR8: Packaging & Distribution

- The extension is packaged as a `.vsix` file using `vsce package`.
- The `.vsix` can be sideloaded onto air-gapped VS Code installations via `code --install-extension enclave-x.y.z.vsix`.
- The `@github/copilot-sdk` npm package is bundled into the extension (webpack/esbuild).
- The Copilot CLI binary is **not** bundled in the `.vsix` for MVP — it must be pre-installed on the target machine. (Bundling is a future improvement.)

---

## 7. Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| NFR1 | **First token latency** | Should feel responsive — first streamed token appears within the same latency as a direct API call to Azure AI Foundry (SDK overhead < 500ms) |
| NFR2 | **Extension activation time** | < 2 seconds (lazy activation on first chat interaction) |
| NFR3 | **VS Code version compatibility** | VS Code 1.93.0+ (Chat Participant API GA) |
| NFR4 | **Node.js compatibility** | Node.js 20+ (VS Code's extension host, per `@github/copilot-sdk` engines requirement) |
| NFR5 | **Copilot SDK version** | `@github/copilot-sdk` latest (Technical Preview) — MIT licensed |
| NFR6 | **Copilot CLI version** | v0.0.418+ (current GA stable as of 2026-02-25) |
| NFR7 | **No external network calls** | The extension must make zero network calls except to the configured Azure AI Foundry endpoint |
| NFR8 | **Bundle size** | < 10 MB for the `.vsix` (excluding Copilot CLI) |
| NFR9 | **License** | This project is licensed under **MIT**. The Copilot SDK dependency is also MIT-licensed. |

---

## 8. Technical Implementation Notes

### Project Structure

```
enclave/
├── .vscode/
│   └── launch.json              # Extension debugging config
├── src/
│   ├── extension.ts             # Activation/deactivation, chat participant registration
│   ├── copilotService.ts        # CopilotClient lifecycle, session management
│   └── configuration.ts         # Read/validate VS Code settings
├── package.json                 # Extension manifest, contributes chatParticipants + config
├── tsconfig.json
├── esbuild.config.mjs           # Bundle for extension host
├── LICENSE                      # MIT License
└── README.md
```

### Key Implementation Details

1. **Chat Participant API**: Use `vscode.chat.createChatParticipant()` to register the participant. The handler receives a `ChatRequest`, `ChatContext`, `ChatResponseStream`, and `CancellationToken`.

2. **SDK Session Management**: Create one `CopilotClient` at activation. Per conversation, maintain a `Map<string, CopilotSession>` keyed by a conversation identifier (derived from `ChatContext` or generated). Reuse sessions for multi-turn conversations.

3. **Cancellation**: Wire the VS Code `CancellationToken` to `session.abort()` so users can stop generation mid-stream.

4. **Copilot CLI Built-in Tools**: For MVP, disable all built-in tools to minimize scope and security surface:
   ```typescript
   const session = await client.createSession({
       model: config.model,
       provider: { ... },
       streaming: true,
       availableTools: [],  // Disable all tools for MVP
   });
   ```

5. **Bundling**: Use esbuild to bundle the extension + SDK into a single file. The `@github/copilot-sdk` package should be bundled (not externalized).

### Dependencies

| Package | Purpose | License |
|---------|---------|---------|
| `@github/copilot-sdk` | Copilot agent runtime SDK (BYOK mode) | MIT |
| `@types/vscode` | VS Code extension API types | MIT |
| `esbuild` | Extension bundling | MIT |
| `@vscode/vsce` | `.vsix` packaging | MIT |

### External Dependencies (pre-installed on target machine)

| Dependency | Version | Purpose |
|------------|---------|---------|
| **Copilot CLI** (`copilot` binary) | v0.0.418+ (current GA stable) | Agent runtime server — the SDK communicates with it via JSON-RPC over stdio |
| **Azure AI Foundry endpoint** | N/A | Model inference (private network). **Provisioning is out of scope for this project.** |

---

## 9. Success Criteria for PoC

| # | Criterion | Validation |
|---|-----------|------------|
| SC1 | A user can open the VS Code chat panel, type a message, and receive a streamed AI response | Manual testing |
| SC2 | All traffic goes to the configured Azure AI Foundry endpoint — no GitHub API calls | Network traffic inspection (e.g., Wireshark / proxy) |
| SC3 | The extension works with no GitHub account configured and no internet access (simulated air-gap) | Test with network disconnected, no `GITHUB_TOKEN` set |
| SC4 | Multi-turn conversation works (follow-up questions maintain context) | Manual testing: ask a follow-up question that references a prior response |
| SC5 | Errors (bad endpoint, invalid key, CLI not found) produce clear messages in the chat panel | Manual testing with deliberate misconfigurations |
| SC6 | The extension can be packaged as `.vsix` and sideloaded onto a clean VS Code installation | Run `vsce package`, install on a separate machine |
| SC7 | Response streaming is visually smooth (tokens appear incrementally) | Manual observation |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Copilot SDK is in Technical Preview** — APIs may change | High | Medium | Pin SDK version; wrap SDK calls in an abstraction layer so changes are isolated |
| **Copilot CLI distribution in air-gapped environments** | Medium | High | For MVP, document manual CLI installation steps (transfer v0.0.418+ binary via approved media). Future: bundle the CLI binary in the `.vsix` or use the Go SDK's embed feature |
| **VS Code Chat Participant API limitations** — may not support all desired UX features | Low | Medium | The Chat API is GA as of VS Code 1.93; core features (markdown streaming, icons, participant registration) are stable |
| **BYOK bearer token expiry for Managed Identity** | N/A for MVP | High (future) | Deferred to post-MVP; documented pattern exists in Copilot SDK docs using `DefaultAzureCredential` |
| **`@github/copilot-sdk` npm package unavailable in air-gapped network** | Medium | High | Bundle the SDK into the `.vsix` at build time (not a runtime dependency); build the `.vsix` in a connected environment before transferring |

---

## 11. Future Roadmap (Post-MVP)

| Phase | Features |
|-------|----------|
| **Phase 2: Tools & Context** | Enable Copilot CLI built-in tools (file system, git); add `@workspace` context via file attachments; add editor selection as context |
| **Phase 3: Auth & Identity** | Azure Managed Identity / Entra ID bearer token support with auto-refresh; VS Code SecretStorage for API keys |
| **Phase 4: Enhanced UX** | Slash commands (`/explain`, `/fix`, `/tests`); inline chat; code actions; conversation history persistence |
| **Phase 5: Distribution** | Bundle Copilot CLI binary in `.vsix`; automated update mechanism for air-gapped environments; enterprise configuration via policy |
| **Phase 6: Multi-Model** | Model picker in the chat panel; support for multiple Azure AI Foundry deployments / endpoints |

---

## 12. Resolved Questions

| # | Question | Resolution |
|---|----------|------------|
| OQ1 | Can the Copilot CLI binary be redistributed / bundled in a third-party `.vsix`? What are the licensing terms? | **This project will use the MIT license.** The Copilot SDK is MIT-licensed. CLI bundling is deferred to Phase 5; for MVP the CLI binary is installed separately on target machines. |
| OQ2 | What is the minimum Copilot CLI version required for BYOK? | **v0.0.418** (current GA stable release as of 2026-02-25). We will target this version and update as needed. |
| OQ3 | Does the VS Code Chat Participant API work in VS Code for the Web (e.g., code-server) or only desktop? | **Unknown / untested.** The MVP targets VS Code Desktop only. Web compatibility (code-server, vscode.dev) is not in scope and can be investigated in a future phase if needed. |
| OQ4 | For the air-gapped environment, is the Azure AI Foundry endpoint already provisioned, or is that part of this effort? | **Out of scope.** The Azure AI Foundry endpoint may or may not already be provisioned. In either case, provisioning and configuring the endpoint is not part of this project. The extension assumes a working endpoint is available and only requires its URL and API key. |
| OQ5 | Should the MVP support configuring multiple model endpoints? | **No.** Single endpoint only for MVP. Multiple endpoint / model picker support is deferred to Phase 6. |

---

## 13. Appendix: Key Reference Documentation

| Resource | URL |
|----------|-----|
| GitHub Copilot SDK — README | https://github.com/github/copilot-sdk |
| Copilot SDK — BYOK Setup Guide | https://github.com/github/copilot-sdk/blob/main/docs/guides/setup/byok.md |
| Copilot SDK — BYOK Auth Reference | https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md |
| Copilot SDK — Azure Managed Identity Guide | https://github.com/github/copilot-sdk/blob/main/docs/guides/setup/azure-managed-identity.md |
| Copilot SDK — Getting Started | https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md |
| Copilot SDK — Node.js README | https://github.com/github/copilot-sdk/blob/main/nodejs/README.md |
| Copilot CLI — Releases | https://github.com/github/copilot-cli/releases |
| VS Code Chat Extensions API | https://code.visualstudio.com/api/extension-guides/chat |
| VS Code Extension Publishing | https://code.visualstudio.com/api/working-with-extensions/publishing-extension |
