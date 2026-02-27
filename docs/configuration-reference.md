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

To use Forge, you must configure two settings in VS Code:

| Setting | Type | Required | Purpose |
|---------|------|----------|---------|
| `forge.copilot.endpoint` | `string` | **Yes** | Azure AI Foundry endpoint URL |
| `forge.copilot.apiKey` | `string` | **Yes** | API key for authentication |

### Optional Settings

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `forge.copilot.model` | `string` | `gpt-4.1` | Model deployment name |
| `forge.copilot.wireApi` | `string` | `completions` | API format (`completions` or `responses`) |
| `forge.copilot.cliPath` | `string` | (empty) | Path to Copilot CLI (if not on `$PATH`) |

---

## Settings Reference

### forge.copilot.endpoint

**Type:** `string`  
**Required:** Yes  
**Default:** (empty)

The Azure AI Foundry endpoint URL where the extension sends all model inference requests.

**Format:**
```
https://{resource-name}.openai.azure.com/openai/v1/
```

**Example:**
```json
{
  "forge.copilot.endpoint": "https://my-ai-resource.openai.azure.com/openai/v1/"
}
```

**Important:**
- Must include the trailing slash (`/`)
- Must include the `/openai/v1/` path segment (Azure AI Foundry's OpenAI-compatible endpoint)
- Verify the URL is reachable from your machine (check network connectivity and firewall rules)

---

### forge.copilot.apiKey

**Type:** `string`  
**Required:** Yes  
**Default:** (empty)

The API key used to authenticate with your Azure AI Foundry endpoint.

**Format:**

Paste the full key value exactly as shown in the Azure Portal for your Azure AI Foundry / Azure OpenAI resource.

**Example:**
```json
{
  "forge.copilot.apiKey": "YOUR_AZURE_AI_FOUNDRY_API_KEY"
}
```

**Security Note:**
- API keys are stored as plaintext in VS Code settings. For production or highly sensitive environments, consider using an alternative authentication method (e.g., environment variables, Azure Managed Identity — planned for Phase 3).
- Never commit your API key to version control.
- Treat API keys as sensitive credentials — only share through secure channels.

---

### forge.copilot.model

**Type:** `string`  
**Required:** No  
**Default:** `gpt-4.1`

The **deployment name** of the model you want to use. This refers to the specific model deployment you created in Azure AI Foundry.

**Examples:**
```json
{
  "forge.copilot.model": "gpt-4.1"
}
```

```json
{
  "forge.copilot.model": "gpt-5"
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
- You downloaded the Copilot CLI to a custom location (see [Installation Guide](installation-guide.md))
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
https://{resource-name}.openai.azure.com/openai/v1/
```

### Components

| Component | Description | Example |
|-----------|-------------|---------|
| `{resource-name}` | The name of your Azure AI resource | `my-company-ai`, `research-gpt-prod` |
| `.openai.azure.com` | Azure's OpenAI-compatible endpoint domain (fixed) | `.openai.azure.com` |
| `/openai/v1/` | The API version path (fixed for OpenAI compatibility) | `/openai/v1/` |

### Examples

**Example 1: Simple resource name**
```
https://acme-ai-prod.openai.azure.com/openai/v1/
```

**Example 2: Regional resource name**
```
https://research-gpt-eastus.openai.azure.com/openai/v1/
```

### Verifying Your Endpoint URL

To verify your endpoint URL is correct:

1. Check the Azure Portal:
   - Navigate to your Azure AI resource
   - Look for **"Endpoint"** or **"Keys and endpoints"** section
   - Copy the endpoint URL

2. Test connectivity from your machine:
   ```bash
   curl -I https://your-endpoint-url/openai/v1/models \
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
https://my-ai-resource.openai.azure.com/openai/v1/
```

### Step 4: Add to Forge Settings

1. Open VS Code
2. Go to **Settings** (`Ctrl+,` / `Cmd+,`)
3. Search for `forge.copilot.apiKey`
4. Paste your API key into the field

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

In Forge, the `forge.copilot.model` setting should contain the **deployment name**, not the model name.

### Example

| Item | Value |
|------|-------|
| **Underlying Model** | GPT-4.1 (from OpenAI) |
| **Your Deployment Name** | `my-company-gpt4-prod` |
| **Forge Setting** | `"forge.copilot.model": "my-company-gpt4-prod"` |

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
  "forge.copilot.endpoint": "https://my-resource.openai.azure.com/openai/v1/",
  "forge.copilot.apiKey": "YOUR_AZURE_AI_FOUNDRY_API_KEY"
}
```

### Example 2: With Custom Model Deployment

```json
{
  "forge.copilot.endpoint": "https://my-resource.openai.azure.com/openai/v1/",
  "forge.copilot.apiKey": "YOUR_AZURE_AI_FOUNDRY_API_KEY",
  "forge.copilot.model": "my-company-gpt5-prod"
}
```

### Example 3: With Custom CLI Path

```json
{
  "forge.copilot.endpoint": "https://my-resource.openai.azure.com/openai/v1/",
  "forge.copilot.apiKey": "YOUR_AZURE_AI_FOUNDRY_API_KEY",
  "forge.copilot.cliPath": "/home/user/copilot-cli/copilot-linux-amd64"
}
```

### Example 4: Using Alternative Wire Format

```json
{
  "forge.copilot.endpoint": "https://my-resource.openai.azure.com/openai/v1/",
  "forge.copilot.apiKey": "YOUR_AZURE_AI_FOUNDRY_API_KEY",
  "forge.copilot.model": "my-deployment",
  "forge.copilot.wireApi": "responses"
}
```

### Example 5: Windows with Full Configuration

```json
{
  "forge.copilot.endpoint": "https://research-gpt.openai.azure.com/openai/v1/",
  "forge.copilot.apiKey": "YOUR_AZURE_AI_FOUNDRY_API_KEY",
  "forge.copilot.model": "research-gpt4-v2",
  "forge.copilot.wireApi": "completions",
  "forge.copilot.cliPath": "C:\\Users\\researcher\\tools\\copilot-windows-amd64.exe"
}
```

---

## Troubleshooting

### Connection Issues

| Problem | Solution |
|---------|----------|
| **"Connection refused"** | Verify your endpoint URL is correct. Test with: `curl https://your-endpoint/openai/v1/models -H "api-key: your-key"` |
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
   curl -I https://your-endpoint/openai/v1/models \
     -H "api-key: your-api-key"
   ```

2. Verify deployment exists:
   ```bash
   curl https://your-endpoint/openai/v1/models \
     -H "api-key: your-api-key"
   ```

3. Check VS Code logs:
   - Open **Output** panel (`Ctrl+Shift+U`)
   - Select **"Forge"** from the dropdown
   - Look for error messages

4. Verify Copilot CLI:
   ```bash
   copilot --version
   copilot server
   ```

---

## Summary

1. **Configure required settings** in VS Code: `endpoint` and `apiKey`
2. **Retrieve credentials** from Azure Portal → your AI resource → "Keys and endpoint"
3. **Use deployment name** (not model name) in the `model` setting
4. **Test connectivity** by opening a chat in VS Code and typing a message
5. **For air-gapped environments**, follow the [Installation Guide](installation-guide.md) for the Copilot CLI

For additional help, consult your platform/DevOps team or Azure documentation.
