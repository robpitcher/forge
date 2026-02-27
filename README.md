# Forge

A VS Code chat extension for air-gapped environments using Azure AI Foundry via Copilot SDK BYOK (Bring Your Own Key) mode. Provides a sidebar chat interface without internet connectivity or GitHub authentication.

The extension uses the GitHub Copilot SDK (`@github/copilot-sdk`) in BYOK mode to route all model inference to a private **Azure AI Foundry** endpoint.

> 📄 See [specs/PRD-airgapped-copilot-vscode-extension.md](specs/PRD-airgapped-copilot-vscode-extension.md) for the full Product Requirements Document.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      VS Code                              │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Forge Sidebar (WebviewView)                 │  │
│  │   User types prompt → sees streamed markdown reply  │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │                                    │
│  ┌────────────────────▼────────────────────────────────┐  │
│  │         Extension Host (our extension)              │  │
│  │   Reads config → Creates CopilotClient (BYOK mode)  │  │
│  │   Creates session → Streams deltas to sidebar    │  │
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

- **VS Code** 1.93 or later
- **Node.js** 20.19.0+ (for development/build)
- **Copilot CLI** v0.0.418+ ([installation guide](https://github.com/github/copilot-cli) or air-gapped distribution)
- **Azure AI Foundry** endpoint (OpenAI-compatible API)

---

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/robpitcher/enclave.git
   cd enclave
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run build
   ```

4. **Package as `.vsix` (for sideloading):**
   ```bash
   npm run package
   ```

5. **Sideload into VS Code:**
   - Open VS Code Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
   - Click "..." menu → "Install from VSIX"
   - Select `forge-0.1.0.vsix`

---

## Configuration

Configure the following settings in VS Code (`Ctrl+,` / `Cmd+,`):

| Setting | Required | Default | Description |
|---------|----------|---------|-------------|
| `forge.copilot.endpoint` | ✓ | — | Azure AI Foundry endpoint URL (e.g., `https://myresource.openai.azure.com/openai/v1/`) |
| `forge.copilot.apiKey` | ✓ | — | API key for the Azure endpoint |
| `forge.copilot.model` | ✗ | `gpt-4.1` | Model deployment name |
| `forge.copilot.wireApi` | ✗ | `completions` | API format: `completions` or `responses` |
| `forge.copilot.cliPath` | ✗ | — | Path to Copilot CLI binary (if not on `$PATH`) |

### Example Configuration

```json
{
  "forge.copilot.endpoint": "https://myresource.openai.azure.com/openai/v1/",
  "forge.copilot.apiKey": "sk-...",
  "forge.copilot.model": "gpt-4.1",
  "forge.copilot.wireApi": "completions"
}
```

---

## Quick Start

1. **Install the Copilot CLI** on your machine (transfer the binary via approved media for air-gapped environments).

2. **Configure settings** in VS Code (`File > Preferences > Settings`, search for `Forge`):

   | Setting | Description |
   |---------|-------------|
   | `forge.copilot.endpoint` | Your Azure AI Foundry endpoint URL |
   | `forge.copilot.apiKey` | Your API key |
   | `forge.copilot.model` | Model deployment name (default: `gpt-4.1`) |

3. **Open the Forge sidebar:** Click the Forge icon in the VS Code activity bar (left sidebar)

4. **Send a message:** Type a message in the input field, then click **Send** or press **Ctrl+Enter** (or **Cmd+Enter** on macOS)

5. **Multi-turn conversations:** The chat maintains session context within the same session

---

## Usage

### Start a chat

1. Click the Forge icon in the VS Code activity bar to open the Forge sidebar
2. Type your message in the input field
3. Click **Send** or press **Ctrl+Enter** (or **Cmd+Enter** on macOS) to submit

### Example prompts

- `Explain how this function works`
- `Write a unit test for this code`
- `What are the performance implications?`

### Stop generation

Click the stop button (⏹) in the sidebar to cancel in-flight requests.

---

## Development

### Build

```bash
npm run build
```

Bundles the extension and SDK into `dist/extension.js`.

### Watch mode

```bash
npm run watch
```

Rebuilds on file changes.

### Linting

```bash
npm run lint
```

Type-checks code with TypeScript.

### Testing

```bash
npm run test
```

Runs automated tests with Vitest.

### Package for distribution

```bash
npm run package
```

Creates `forge-0.1.0.vsix` for sideloading or distribution.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      VS Code                              │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Forge Sidebar (WebviewView)               │  │
│  │   User types prompt → sees streamed markdown reply  │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │                                    │
│  ┌────────────────────▼────────────────────────────────┐  │
│  │         Extension Host (our extension)              │  │
│  │   Reads config → Creates CopilotClient (BYOK mode)  │  │
│  │   Creates session → Streams deltas to sidebar    │  │
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

### Source files

- **`src/extension.ts`** — VS Code extension activation, chat participant registration, request handler, streaming response logic, and user cancellation
- **`src/copilotService.ts`** — CopilotClient lifecycle management, BYOK session creation with Azure AI Foundry configuration, session reuse map
- **`src/configuration.ts`** — VS Code settings reader and validation for required fields
- **`src/types.ts`** — TypeScript type definitions for SDK interfaces

---

## Configuration Reference

| Setting | Type | Required | Default | Description |
|---------|------|----------|---------|-------------|
| `forge.copilot.endpoint` | `string` | Yes | `""` | Azure AI Foundry endpoint URL |
| `forge.copilot.apiKey` | `string` | Yes | `""` | API key for the Azure AI Foundry endpoint |
| `forge.copilot.model` | `string` | Yes | `"gpt-4.1"` | Model deployment name |
| `forge.copilot.wireApi` | `string` | No | `"completions"` | API format: `"completions"` or `"responses"` |
| `forge.copilot.cliPath` | `string` | No | `""` | Path to Copilot CLI binary (if not on PATH) |

---

## Building from Source

```sh
npm install
npm run build
npm run package
```

This produces `forge-0.1.0.vsix` in the project root.

---

## License

[MIT](LICENSE)
