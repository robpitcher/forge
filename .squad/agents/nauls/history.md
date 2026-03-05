# Nauls — History

## Project Context

- **Project:** Forge — VS Code chat extension for air-gapped environments via Azure AI Foundry (BYOK mode)
- **Stack:** TypeScript, VS Code Extension API, @github/copilot-sdk, esbuild, vitest
- **Owner:** Rob Pitcher
- **Joined:** 2026-03-02

## Learnings

- **Architecture diagram components (verified from source):** Forge Sidebar (WebviewView) ↔ Extension Host (Config + CopilotClient) ↔ Copilot CLI (stdio subprocess) → Azure AI Foundry (HTTPS). CredentialProvider is internal to Extension Host, supports Entra ID (DefaultAzureCredential) and API Key (SecretStorage). Connection types: postMessage (sidebar↔host), JSON-RPC over stdio (host↔CLI), HTTPS over private network (CLI→Azure).
- **Mermaid on GitHub:** Use `<br/>` for line breaks in node labels. Bidirectional arrows `<-->` and dotted arrows `-.->` render correctly. Subgraph labels use `["quoted text"]` syntax.
- **Diagram scope discipline:** Only edit the Architecture section when Fuchs is concurrently editing other README sections — coordinate via section boundaries.
- **Enterprise diagram pattern:** Multi-layer subgraphs (Client, Identity, Network, AI Services, Observability) with clear edge labels for data flows (HTTPS, tokens, telemetry, metrics). Color-coded by domain (blue=client, purple=identity, orange=network, green=AI, pink=observability) for visual scanability.
