# Features & Usage

## Authentication Methods

Forge supports two authentication methods, controlled by `forge.copilot.authMethod`:

- **Entra ID** (default) — Uses `DefaultAzureCredential` from `@azure/identity`. Authenticate via `az login` or managed identity. Recommended for environments with Azure AD.
- **API Key** — Uses a static API key stored securely in VS Code SecretStorage. Set via the ⚙️ gear icon → "Set API Key (secure)". Use for environments without Entra ID.

## Code Actions

Right-click on code or use the editor lightbulb menu (💡) to access:

- **Explain with Forge** — Get an explanation of selected code
- **Fix with Forge** — Ask Forge to fix selected code
- **Write Tests with Forge** — Generate tests for selected code

## Model Selector

Use the model dropdown in the chat UI to switch between configured deployment names. Models are configured via `forge.copilot.models` — values must match the **deployment name** in Azure AI Foundry, not the underlying model name.

## Usage

### Start a chat

1. Click the Forge icon in the VS Code sidebar to open the Forge chat
2. Type your message in the input field
3. Press **Enter** to send (Shift+Enter for newline)

### Example prompts

- `Explain how this function works`
- `Write a unit test for this code`
- `What are the performance implications?`
