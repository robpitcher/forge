# Azure AI Foundry Configuration Reference

This guide explains how to configure the Forge VS Code extension to use your Azure AI Foundry endpoint.

---

## Table of Contents

1. [Configuration Overview](#configuration-overview)
2. [Settings Reference](#settings-reference)
3. [Azure AI Foundry Setup](#azure-ai-foundry-setup)
4. [Endpoint URL Format](#endpoint-url-format)
5. [API Key Retrieval](#api-key-retrieval)
6. [Deployment Name vs Model Name](#deployment-name-vs-model-name)
7. [Wire API Setting](#wire-api-setting)
8. [Example Configurations](#example-configurations)
9. [Troubleshooting](#troubleshooting)

---

## Configuration Overview

The Forge extension communicates with your Azure AI Foundry endpoint using credentials and configuration that you provide via VS Code settings. All configuration is stored locally in VS Code (no data leaves your machine except to your private endpoint).

### Required Settings

To use Forge, you must configure one setting in VS Code:

| Setting | Type | Required | Purpose |
|---------|------|----------|---------|
| `forge.copilot.endpoint` | `string` | **Yes** | Azure AI Foundry endpoint URL |

For **Entra ID** auth (default): authenticate via `az login` or managed identity — no further credential configuration needed.

For **API Key** auth: set your API key via the Forge chat toolbar ⚙️ gear icon → "Set API Key (secure)" (see [API Key Retrieval](#api-key-retrieval) below).

### Optional Settings

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `forge.copilot.models` | `string[]` | `[]` | Deployment names for the model selector (first entry is default) |
| `forge.copilot.wireApi` | `string` | `completions` | API format (`completions` or `responses`) |
| `forge.copilot.cliPath` | `string` | (empty) | Path to Copilot CLI (if not on `$PATH`) |
| `forge.copilot.authMethod` | `string` | `entraId` | Auth method: `entraId` or `apiKey` |
| `forge.copilot.systemMessage` | `string` | (empty) | Custom system message appended to the default Copilot system prompt |
| `forge.copilot.autoApproveTools` | `boolean` | `false` | Auto-approve tool executions without confirmation |

---

## Settings Reference

### forge.copilot.endpoint

**Type:** `string`  
**Required:** Yes  
**Default:** (empty)

The Azure AI Foundry endpoint URL where the extension sends all model inference requests.

**Format:**
```
https://{resource-name}.openai.azure.com/
```

**Example:**
```json
{
  "forge.copilot.endpoint": "https://my-ai-resource.openai.azure.com/"
}
```

**Important:**
- Do **not** include the `/openai/v1/` path — the SDK auto-appends this for `.azure.com` endpoints
- Verify the URL is reachable from your machine (check network connectivity and firewall rules)

---

### forge.copilot.models

**Type:** `string[]`  
**Required:** No  
**Default:** `[]`

An array of **deployment names** from your Azure AI Foundry resource. These populate the model selector dropdown in the chat UI. The first entry is the default active model.

Values must match the **deployment name** in Azure AI Foundry, not the underlying model name.

**Examples:**
```json
{
  "forge.copilot.models": ["gpt-4.1", "gpt-4o"]
}
```

```json
{
  "forge.copilot.models": ["my-company-gpt5-prod"]
}
```

**Note:** See [Deployment Name vs Model Name](#deployment-name-vs-model-name) for the distinction.

---

### forge.copilot.wireApi

**Type:** `string` (enum)  
**Required:** No  
**Default:** `completions`  
**Allowed Values:** `completions`, `responses`

Controls the wire protocol used to communicate with the Azure AI Foundry endpoint. Both formats are OpenAI-compatible, but use slightly different JSON schemas.

#### `completions` (Default)

Uses the OpenAI Completions API format:

```json
POST https://your-endpoint.openai.azure.com/openai/v1/chat/completions
{
  "model": "gpt-4.1",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "max_tokens": 2000,
  "stream": true
}
```

**Use this if:**
- Your Azure AI Foundry deployment is configured for OpenAI-compatible Chat Completions
- You are using a standard GPT model (GPT-4.1, GPT-5, etc.)

#### `responses`

Uses the Responses API format, a REST API with a different schema that is also OpenAI-compatible:

```json
{
  "model": "gpt-4.1",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": true
}
```

**Use this if:**
- Your Azure AI Foundry deployment is configured for the `responses` format
- Your deployment documentation explicitly requires this format

**Example:**
```json
{
  "forge.copilot.wireApi": "completions"
}
```

If you are unsure which format to use, start with the default (`completions`).

---

### forge.copilot.cliPath

**Type:** `string`  
**Required:** No  
**Default:** (empty)

The absolute path to the Copilot CLI binary. Use this if the CLI is not installed on your system `$PATH`.

**Format:**
```
/absolute/path/to/copilot
```

**Examples:**

Linux/macOS:
```json
{
  "forge.copilot.cliPath": "/home/user/copilot-cli/copilot-linux-amd64"
}
```

Windows:
```json
{
  "forge.copilot.cliPath": "C:\\Users\\user\\copilot-cli\\copilot-windows-amd64.exe"
}
```

**When to use this:**
- You downloaded the Copilot CLI to a custom location (see [Copilot CLI repository](https://github.com/github/copilot-cli))
- You do not have permission to install the CLI globally on your machine
- You want to use a specific version of the CLI

---

## Azure AI Foundry Setup

### Prerequisites

Before configuring Forge, ensure you have:

1. **An Azure subscription**
2. **An Azure AI Foundry resource** deployed in your subscription
3. **A model deployment** within that resource (e.g., GPT-4.1, GPT-5)
4. **API key** from the resource
5. **Network access** from your machine to the endpoint

### Creating an Azure AI Foundry Resource

> **Note:** Provisioning and configuring the Azure AI Foundry endpoint is outside the scope of this project. Consult your platform/DevOps team or Azure documentation for deployment instructions.

If you need to set up a new resource:

1. Go to **Azure Portal** (`https://portal.azure.com`)
2. Create a new **Azure AI Services** or **Azure OpenAI** resource
3. Deploy a model (e.g., GPT-4.1)
4. Retrieve the endpoint URL and API key (see next section)

---

## Endpoint URL Format

### Standard Format

Azure AI Foundry endpoints follow this URL pattern:

```
https://{resource-name}.openai.azure.com/
```

### Components

| Component | Description | Example |
|-----------|-------------|---------|
| `{resource-name}` | The name of your Azure AI resource | `my-company-ai`, `research-gpt-prod` |
| `.openai.azure.com` | Azure's OpenAI-compatible endpoint domain (fixed) | `.openai.azure.com` |

> **Note:** Do **not** include `/openai/v1/` in your endpoint URL — the SDK auto-appends this path for `.azure.com` endpoints.

### Examples

**Example 1: Simple resource name**
```
https://acme-ai-prod.openai.azure.com/
```

**Example 2: Regional resource name**
```
https://research-gpt-eastus.openai.azure.com/
```

### Verifying Your Endpoint URL

To verify your endpoint URL is correct:

1. Check the Azure Portal:
   - Navigate to your Azure AI resource
   - Look for **"Endpoint"** or **"Keys and endpoints"** section
   - Copy the endpoint URL

2. Test connectivity from your machine:
   ```bash
   curl -I https://your-endpoint-url/openai/deployments \
     -H "api-key: your-api-key"
   ```
   
   You should receive a `200 OK` or `401 Unauthorized` response (401 means the endpoint exists but your key is wrong).

---

## API Key Retrieval

### Step 1: Open Azure Portal

Go to **Azure Portal** (`https://portal.azure.com`) and sign in with your Azure account.

### Step 2: Navigate to Your Resource

1. In the search bar at the top, search for your Azure AI resource name
2. Click on your resource to open it

### Step 3: Retrieve the API Key

1. In the left sidebar, click **"Keys and endpoint"** (or **"Keys"**)
2. You will see two API keys listed (Key 1 and Key 2)
3. Copy either key (they are functionally equivalent; you can rotate them independently)

**Example view:**
```
Keys and endpoint
Keys
Key 1: ********************************
Key 2: ********************************

Endpoint
https://my-ai-resource.openai.azure.com/
```

### Step 4: Set Your API Key in Forge

The API key is stored securely and **not** in settings.json:

1. Open the Forge chat panel in VS Code (click the Forge icon in the sidebar)
2. Click the ⚙️ **gear icon** in the chat toolbar
3. Select **"Set API Key (secure)"**
4. Enter your Azure AI Foundry API key in the masked password input
5. The key is now stored securely in VS Code SecretStorage (encrypted by your OS keychain)

---

## Deployment Name vs Model Name

Azure AI Foundry uses two related but distinct concepts:

### Model Name

The **underlying model** you are using (e.g., GPT-4.1, GPT-5).

- Fixed and standardized by OpenAI / Microsoft
- Examples: `gpt-4.1`, `gpt-5`, `gpt-35-turbo`
- You **cannot change** this; it is determined by the model you deployed

### Deployment Name

The **name you give** to your specific deployment of that model in Azure.

- Custom identifier you choose when creating the deployment
- Can be anything: `my-gpt4-prod`, `research-gpt5-v2`, `customer-facing-chatbot`
- You **can change** this by redeploying

### The Configuration Setting

In Forge, the `forge.copilot.models` setting should contain **deployment names**, not model names.

### Example

| Item | Value |
|------|-------|
| **Underlying Model** | GPT-4.1 (from OpenAI) |
| **Your Deployment Name** | `my-company-gpt4-prod` |
| **Forge Setting** | `"forge.copilot.models": ["my-company-gpt4-prod"]` |

### How to Find Your Deployment Name

1. Open **Azure Portal**
2. Navigate to your Azure AI resource
3. In the left sidebar, click **"Model deployments"** or **"Deployments"**
4. See the list of deployments with their names
5. Use the deployment name (not the model name) in your Forge configuration

**Example screenshot (conceptual):**
```
Deployments
Name                          | Model        | Status
my-company-gpt4-prod          | gpt-4.1      | Succeeded
research-gpt5-testing         | gpt-5        | Succeeded
customer-chatbot-v2           | gpt-35-turbo | Succeeded
```

---

## Wire API Setting

### What is `wireApi`?

The `wireApi` setting controls the **JSON format** used to communicate with your endpoint. Both options are OpenAI-compatible, but differ slightly in structure.

### Default: `completions`

The OpenAI Chat Completions API format. This is the standard and most widely supported format.

**Request example:**
```json
POST https://your-endpoint/openai/v1/chat/completions
{
  "model": "gpt-4.1",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Explain React hooks." }
  ],
  "max_tokens": 2000,
  "temperature": 0.7,
  "stream": true
}
```

**When to use:**
- Your deployment is OpenAI Chat Completions-compatible
- You are using GPT-4.1, GPT-5, or similar modern models
- You are unsure which format to use (this is the default)

### Alternative: `responses`

An alternative OpenAI-compatible format that some deployments may require.

**Request example (slightly different JSON schema):**
```json
{
  "model": "gpt-4.1",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Explain React hooks." }
  ],
  "stream": true
}
```

**When to use:**
- Your Azure AI Foundry documentation explicitly specifies `responses` format
- You are integrating with a custom or older deployment
- The default `completions` format does not work for your endpoint

### How to Determine Which Format Your Endpoint Supports

1. Check your **Azure Portal**:
   - Go to your deployment details
   - Look for API version or format specifications

2. Test with curl (if you have endpoint access):
   ```bash
   # Test completions format
   curl -X POST https://your-endpoint/openai/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "api-key: your-api-key" \
     -d '{
       "model": "your-deployment-name",
       "messages": [{"role": "user", "content": "test"}],
       "stream": false
     }'
   ```

3. Consult your platform/DevOps team

---

## Example Configurations

### Example 1: Basic Configuration (Minimum)

```json
{
  "forge.copilot.endpoint": "https://my-resource.openai.azure.com/"
}
```

With Entra ID auth (default), no further credential setup is needed — just `az login`.

### Example 2: With Custom Model Deployments

```json
{
  "forge.copilot.endpoint": "https://my-resource.openai.azure.com/",
  "forge.copilot.models": ["my-company-gpt5-prod", "gpt-4o"]
}
```

### Example 3: With Custom CLI Path

```json
{
  "forge.copilot.endpoint": "https://my-resource.openai.azure.com/",
  "forge.copilot.cliPath": "/home/user/copilot-cli/copilot-linux-amd64"
}
```

### Example 4: Using Alternative Wire Format

```json
{
  "forge.copilot.endpoint": "https://my-resource.openai.azure.com/",
  "forge.copilot.models": ["my-deployment"],
  "forge.copilot.wireApi": "responses"
}
```

### Example 5: API Key Auth with Full Configuration

```json
{
  "forge.copilot.endpoint": "https://research-gpt.openai.azure.com/",
  "forge.copilot.authMethod": "apiKey",
  "forge.copilot.models": ["research-gpt4-v2"],
  "forge.copilot.wireApi": "completions",
  "forge.copilot.cliPath": "C:\\Users\\researcher\\tools\\copilot-windows-amd64.exe"
}
```

Then use the ⚙️ gear icon to set your API key securely.

---

## Troubleshooting

### Connection Issues

| Problem | Solution |
|---------|----------|
| **"Connection refused"** | Verify your endpoint URL is correct and does not include `/openai/v1/` (the SDK appends this automatically). Test with: `curl https://your-endpoint.openai.azure.com/openai/deployments -H "api-key: your-key"` |
| **"Timeout"** | Check network connectivity to Azure. Verify firewall rules allow outbound HTTPS. Check if your VPN/proxy requires special configuration. |
| **"403 Forbidden"** | Your API key may be expired or incorrect. Verify in Azure Portal and regenerate if needed. |

### Authentication Issues

| Problem | Solution |
|---------|----------|
| **"Invalid API key"** | Double-check the key in Azure Portal. Ensure no extra spaces or formatting. |
| **"Unauthorized"** | Your API key is correct but may lack permissions. Check Azure role assignments. |

### Model / Deployment Issues

| Problem | Solution |
|---------|----------|
| **"Model not found"** | Verify the deployment name matches exactly (case-sensitive). Check Azure Portal for the correct name. |
| **"Deployment not ready"** | Wait for the deployment to finish provisioning in Azure Portal (status should be "Succeeded"). |

### Format Issues

| Problem | Solution |
|---------|----------|
| **"Invalid request format"** | Try switching `forge.copilot.wireApi` to `"responses"`. Check your deployment's API format specification. |

### Debug Steps

1. Verify connectivity:
   ```bash
   curl -I https://your-endpoint.openai.azure.com/openai/deployments \
     -H "api-key: your-api-key"
   ```

2. Verify deployment exists:
   ```bash
   curl https://your-endpoint.openai.azure.com/openai/deployments \
     -H "api-key: your-api-key"
   ```

3. Check VS Code logs:
   - Open **Output** panel (`Ctrl+Shift+U`)
   - Select **"Log (Extension Host)"** from the dropdown
   - Look for error messages

4. Verify Copilot CLI:
   ```bash
   copilot --version
   copilot server
   ```

---

## Summary

1. **Configure the required setting** in VS Code: `endpoint`
2. **Authenticate**: Use Entra ID (default, via `az login`) or set an API key via the ⚙️ gear icon
3. **Use deployment names** (not model names) in the `models` setting
4. **Test connectivity** by opening a chat in VS Code and typing a message
5. **For restricted networks**, see the [Copilot CLI repository](https://github.com/github/copilot-cli) for Copilot CLI installation instructions

For additional help, consult your platform/DevOps team or Azure documentation.
