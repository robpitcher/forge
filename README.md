# Forge

A VS Code chat extension for air-gapped environments using Azure AI Foundry via Copilot SDK BYOK (Bring Your Own Key) mode. Provides a sidebar chat interface without requiring internet connectivity or GitHub authentication.

The extension uses the GitHub Copilot SDK (`@github/copilot-sdk`) in BYOK mode to route all model inference to a private **Azure AI Foundry** endpoint.

## Prerequisites

- **VS Code** 1.93 or later
- **Node.js** 20.19.0+ (for development/build)
- **GitHub Copilot CLI** binary (`copilot` v0.0.418+ from [github/copilot-cli](https://github.com/github/copilot-cli); you can override the path via `forge.copilot.cliPath`)
- **Azure AI Foundry** endpoint (OpenAI-compatible API)

## Quick Start

1. **Install the Copilot CLI** on your machine. See [docs/installation-guide.md](docs/installation-guide.md) for detailed, installation steps.

2. **Configure settings** in VS Code (`File > Preferences > Settings`, search for `Forge`):

   | Setting | Description |
   |---------|-------------|
   | `forge.copilot.endpoint` | Your Azure AI Foundry endpoint URL (e.g., `https://myresource.openai.azure.com/`) |
   | `forge.copilot.authMethod` | Auth method: `"entraId"` (default) or `"apiKey"` |
   | `forge.copilot.models` | Available model deployments (default: `["gpt-4.1", "gpt-4o", "gpt-4o-mini"]`) |

   **API Key (if using `apiKey` auth):** Click the ⚙️ gear icon in the Forge chat toolbar and select "Set API Key (secure)".

3. **Open Forge:** Click the Forge icon in the VS Code sidebar

4. **Send a message:** Type a message in the input field, then press **Enter** to send (Shift+Enter for newline)

5. **Multi-turn conversations:** The chat maintains session context within the same session

## Features

### Authentication Methods

Forge supports two authentication methods, controlled by `forge.copilot.authMethod`:

- **Entra ID** (default) — Uses `DefaultAzureCredential` from `@azure/identity`. Authenticate via `az login` or managed identity. Recommended for environments with Azure AD.
- **API Key** — Uses a static API key stored securely in VS Code SecretStorage. Set via the ⚙️ gear icon → "Set API Key (secure)". Use for environments without Entra ID.

### Code Actions

Right-click on code or use the editor lightbulb menu (💡) to access:

- **Explain with Forge** — Get an explanation of selected code
- **Fix with Forge** — Ask Forge to fix selected code
- **Write Tests with Forge** — Generate tests for selected code

### Model Selector

Use the model dropdown in the chat UI to switch between configured models. Models are configured via `forge.copilot.models`.

## Usage

### Start a chat

1. Click the Forge icon in the VS Code sidebar to open the Forge chat
2. Type your message in the input field
3. Press **Enter** to send (Shift+Enter for newline)

### Example prompts

- `Explain how this function works`
- `Write a unit test for this code`
- `What are the performance implications?`

### Stop generation

Click the stop button (⏹) in the sidebar to cancel in-flight requests.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      VS Code                              │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Forge Sidebar (WebviewView)                 │  │
│  │   User types prompt → sees streamed markdown reply  │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │                                   │
│  ┌────────────────────▼────────────────────────────────┐  │
│  │         Extension Host (our extension)              │  │
│  │   Reads config → Creates CopilotClient (BYOK mode)  │  │
│  │   Creates session → Streams deltas to sidebar       │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │ JSON-RPC (stdio)                  │
│  ┌────────────────────▼────────────────────────────────┐  │
│  │   Copilot CLI (local stdio process via SDK)         │  │
│  └────────────────────┬────────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────┘
                        │ HTTPS (private network)
                        ▼
┌──────────────────────────────────────────────────────────┐
│           Azure AI Foundry (Private Endpoint)            │
└──────────────────────────────────────────────────────────┘
```

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/robpitcher/forge.git
   cd forge
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

## Configuration

Configure settings in VS Code (`Ctrl+,` / `Cmd+,`):

### Core Settings

| Setting | Type | Required | Default | Description |
|---------|------|----------|---------|-------------|
| `forge.copilot.endpoint` | `string` | Yes | `""` | Azure AI Foundry endpoint URL (e.g., `https://myresource.openai.azure.com/`) |
| `forge.copilot.models` | `string[]` | No | `["gpt-4.1", "gpt-4o", "gpt-4o-mini"]` | Available model deployments for the model selector. First entry is the default. |
| `forge.copilot.wireApi` | `string` | No | `"completions"` | API format: `"completions"` or `"responses"` |
| `forge.copilot.cliPath` | `string` | No | `""` | Path to Copilot CLI binary (if not on PATH) |
| `forge.copilot.authMethod` | `string` | No | `"entraId"` | Auth method: `"entraId"` (DefaultAzureCredential) or `"apiKey"` |
| `forge.copilot.systemMessage` | `string` | No | `""` | Custom system message appended to the default Copilot system prompt |

### Tool Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `forge.copilot.autoApproveTools` | `boolean` | `false` | Auto-approve tool executions without confirmation |
| `forge.copilot.tools.shell` | `boolean` | `true` | Enable the Shell tool (execute terminal commands) |
| `forge.copilot.tools.read` | `boolean` | `true` | Enable the Read tool (read file contents) |
| `forge.copilot.tools.write` | `boolean` | `true` | Enable the Write tool (write/edit files) |
| `forge.copilot.tools.url` | `boolean` | `false` | Enable the URL tool (fetch web content) |
| `forge.copilot.tools.mcp` | `boolean` | `true` | Enable MCP tool support (Model Context Protocol servers) |

### MCP Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `forge.copilot.mcpAllowRemote` | `boolean` | `false` | Allow remote (HTTP/SSE) MCP servers |
| `forge.copilot.mcpServers` | `object` | `{}` | MCP server configurations (see below) |

**MCP Server Configuration:**

```json
{
  "forge.copilot.mcpServers": {
    "my-local-server": {
      "command": "npx",
      "args": ["-y", "@my/mcp-server"],
      "env": { "API_KEY": "..." }
    },
    "my-remote-server": {
      "url": "http://internal-host:3000/sse",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

### Example Configuration

```json
{
  "forge.copilot.endpoint": "https://myresource.openai.azure.com/",
  "forge.copilot.authMethod": "entraId",
  "forge.copilot.models": ["gpt-4.1", "gpt-4o"],
  "forge.copilot.wireApi": "completions"
}
```

> **Note:** The SDK auto-appends `/openai/v1/` for `.azure.com` endpoints — do not include this path in your endpoint URL.

**API Key Setup:** Click the ⚙️ gear icon in the Forge chat toolbar and select "Set API Key (secure)" to enter your API key via a masked password input. The key is stored securely in VS Code SecretStorage and never appears in settings.json.

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
npm run lint        # ESLint
npm run lint:types  # TypeScript type-checking (tsc --noEmit)
```

Lints source code with ESLint. Use `lint:types` for TypeScript type-checking.

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
