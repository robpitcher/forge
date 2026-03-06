---
theme: seriph
title: "Forge — AI Chat for Air-Gapped Environments"
info: |
  A VS Code extension that routes AI chat through your Azure AI Foundry endpoint.
  No GitHub auth. No public endpoints. Full tenant control.
transition: slide-left
mdc: true
fonts:
  sans: 'ui-sans-serif, system-ui, sans-serif'
  serif: 'ui-serif, Georgia, serif'
  mono: 'ui-monospace, monospace'
  provider: none
---

<div class="flex flex-col items-center justify-center h-full">
  <img src="/repoheader.png" class="w-160 mb-8" alt="Forge" />
  <p class="text-xl text-gray-400 !leading-8">
    AI Chat for Air-Gapped Environments
  </p>
  <p class="text-sm text-gray-500 mt-4">
    A VS Code extension powered by Azure AI Foundry
  </p>
</div>

---
layout: center
---

# The Problem

- Enterprises need **AI-powered developer chat** inside VS Code
- Public AI endpoints violate **compliance, data sovereignty, and security** requirements
- Air-gapped and sovereign cloud networks **cannot reach external services**
- Teams need **full control** over which models are deployed and where inference runs

---

# What is Forge?

A VS Code extension that routes AI chat through **your** Azure AI Foundry endpoint.

- 🔒 **No GitHub auth required** — uses your Entra ID or API key
- 🏢 **Full tenant control** — all inference stays within your Azure subscription
- 🔌 **BYOK mode** — Bring Your Own Key via the GitHub Copilot SDK
- 🌐 **Air-gap ready** — works in disconnected, sovereign, and private networks
- 💬 **Rich chat experience** — multi-turn, streaming, code context, tool approval

---

# Architecture

How Forge routes inference through your private endpoint:

```mermaid
graph LR
    A[VS Code] -->|Extension Host| B[Forge Extension]
    B -->|"@github/copilot-sdk"| C[Copilot CLI]
    C -->|HTTPS| D[Azure AI Foundry]
    style A fill:#0078d4,stroke:#005a9e,color:#fff
    style B fill:#68217a,stroke:#4b1560,color:#fff
    style C fill:#333,stroke:#555,color:#fff
    style D fill:#0078d4,stroke:#005a9e,color:#fff
```

- **Forge Extension** manages chat UI, context attachments, and session lifecycle
- **Copilot CLI** handles model inference via the SDK's BYOK provider
- **Azure AI Foundry** runs your deployed models in your tenant — GPT-4.1, GPT-4o, o3, and more

---

# Key Features

<div class="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">

- 🔑 **Dual auth** — Entra ID or API key
- 🤖 **Multi-model support** — switch between deployments
- ⚡ **Streaming responses** — real-time token delivery
- 📎 **Context attachments** — send selections, files, or workspace context
- 🛡️ **Tool approval** — user confirms before tool execution
- 🧠 **Workspace awareness** — understands your project structure
- ⏹️ **Stop generation** — cancel in-flight requests
- 🔄 **Multi-turn chat** — session reuse across conversations

</div>

---

# Getting Started

Four steps to your first chat:

**1. Install the extension**
> Search "Forge" in the VS Code Extensions panel, or sideload the `.vsix`

**2. Configure your endpoint**
```json
{
  "forge.copilot.endpoint": "https://resource.services.ai.azure.com/",
  "forge.copilot.models": ["gpt-4.1", "gpt-4o"]
}
```

**3. Authenticate**
> Choose Entra ID (default) or store an API key via the command palette

**4. Start chatting**
> Open the Forge panel and ask a question — streaming responses begin immediately

---

# Enterprise Architecture

<div class="grid grid-cols-2 gap-8 mt-4">
<div>

**Private networking**

- Azure Private Endpoints
- ExpressRoute / VPN tunnels
- No public internet required

</div>
<div>

**Governance & observability**

- Azure API Management gateway
- Token usage & audit logging
- Entra ID conditional access policies
- Model deployment controls

</div>
</div>

```mermaid {scale: 0.7}
graph LR
    A[Developer Workstation] -->|Private Network| B[Azure APIM]
    B -->|Managed Identity| C[Azure AI Foundry]
    C -->|Private Endpoint| D[Model Deployment]
    style B fill:#0078d4,stroke:#005a9e,color:#fff
    style C fill:#68217a,stroke:#4b1560,color:#fff
```

---

# Built With

<div class="grid grid-cols-2 gap-8 mt-8">
<div>

### Runtime

- **GitHub Copilot SDK** — `@github/copilot-sdk` v0.1.26
- **VS Code Extension API** — WebviewViewProvider
- **TypeScript** — strict mode, full type safety

</div>
<div>

### Toolchain

- **esbuild** — fast bundling for extension host
- **vitest** — unit testing with VS Code mocks
- **ESLint** — code quality enforcement

</div>
</div>

---
layout: center
class: text-center
---

# Get Started with Forge

<div class="text-lg mt-4 mb-8 text-gray-400">
AI chat that stays within your walls.
</div>

<div class="grid grid-cols-3 gap-8 mt-8 text-sm">

<div>

📦 **Repository**

[github.com/robpitcher/forge](https://github.com/robpitcher/forge)

</div>

<div>

🏪 **VS Code Marketplace**

Search "Forge" in Extensions

</div>

<div>

📖 **Documentation**

[Configuration Reference](https://github.com/robpitcher/forge/blob/main/docs/configuration-reference.md)

</div>

</div>
