# Air-Gapped Copilot

A VS Code extension that provides a Copilot-like chat experience for **air-gapped environments** — no GitHub authentication, no internet access to GitHub services required. The extension uses the GitHub Copilot SDK (`@github/copilot-sdk`) in BYOK (Bring Your Own Key) mode to route all model inference to a private **Azure AI Foundry** endpoint.

> 📄 See [specs/PRD-airgapped-copilot-vscode-extension.md](specs/PRD-airgapped-copilot-vscode-extension.md) for the full Product Requirements Document.

---

## Architecture

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
│  │   Reads config → Creates CopilotClient (BYOK mode)  │  │
│  │   Creates session → Streams deltas to chat panel    │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │ JSON-RPC (stdio)                   │
│  ┌────────────────────▼────────────────────────────────┐  │
│  │         Copilot CLI (server mode, local process)    │  │
│  └────────────────────┬────────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────┘
                        │ HTTPS (private network)
                        ▼
┌──────────────────────────────────────────────────────────┐
│           Azure AI Foundry (Private Endpoint)             │
└──────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- **VS Code** 1.93.0 or later
- **Copilot CLI** v0.0.418 or later — must be installed and available on `PATH` (or configured via `airgapped.copilot.cliPath`)
- **Azure AI Foundry endpoint** — a running Azure AI Foundry deployment with a known endpoint URL and API key

---

## Quick Start

1. **Install the Copilot CLI** on your machine (transfer the binary via approved media for air-gapped environments).

2. **Configure settings** in VS Code (`File > Preferences > Settings`, search for `Air-Gapped Copilot`):

   | Setting | Description |
   |---------|-------------|
   | `airgapped.copilot.endpoint` | Your Azure AI Foundry endpoint URL |
   | `airgapped.copilot.apiKey` | Your API key |
   | `airgapped.copilot.model` | Model deployment name (default: `gpt-4.1`) |

3. **Sideload the `.vsix`**:
   ```sh
   code --install-extension airgapped-copilot-0.1.0.vsix
   ```

4. **Open the Chat panel** in VS Code and start chatting with `@copilot`.

---

## Configuration Reference

| Setting | Type | Required | Default | Description |
|---------|------|----------|---------|-------------|
| `airgapped.copilot.endpoint` | `string` | Yes | `""` | Azure AI Foundry endpoint URL |
| `airgapped.copilot.apiKey` | `string` | Yes | `""` | API key for the Azure AI Foundry endpoint |
| `airgapped.copilot.model` | `string` | Yes | `"gpt-4.1"` | Model deployment name |
| `airgapped.copilot.wireApi` | `string` | No | `"completions"` | API format: `"completions"` or `"responses"` |
| `airgapped.copilot.cliPath` | `string` | No | `""` | Path to Copilot CLI binary (if not on PATH) |

---

## Building from Source

```sh
npm install
npm run build
npm run package
```

This produces `airgapped-copilot-0.1.0.vsix` in the project root.

---

## License

[MIT](LICENSE)
