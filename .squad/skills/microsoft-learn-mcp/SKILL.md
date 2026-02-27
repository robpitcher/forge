# Skill: Microsoft Learn MCP Integration

**Confidence:** `medium`
**Domain:** Documentation lookup, Azure/Microsoft API reference, code samples
**MCP Prefix:** `microsoft-learn-*`

## Overview

Three MCP tools provide direct access to official Microsoft Learn documentation. Use these instead of web search when the question involves Microsoft/Azure products, services, SDKs, or APIs.

## Available Tools

### 1. `microsoft-learn-microsoft_docs_search`

**Purpose:** Search official Microsoft/Azure documentation by topic.

**Parameters:**
- `query` (string) — natural language query about Microsoft/Azure products

**Returns:** Up to 10 content chunks (max 500 tokens each) with title, URL, and excerpt.

**Best for:** Finding the right doc page, getting quick answers, discovering API patterns.

**Example queries:**
- `"Azure AI Foundry model deployment"`
- `"VS Code extension API chat participant"`
- `"Copilot SDK BYOK mode configuration"`

### 2. `microsoft-learn-microsoft_code_sample_search`

**Purpose:** Search for code snippets and examples from Microsoft docs.

**Parameters:**
- `query` (string, required) — descriptive query, SDK/class/method name
- `language` (string, optional) — filter by language. Values: `csharp`, `javascript`, `typescript`, `python`, `powershell`, `azurecli`, `sql`, `java`, `kusto`, `cpp`, `go`, `rust`, `ruby`, `php`

**Returns:** Code snippets with description, package info, language tag, source URL.

**Best for:** Finding official SDK usage patterns, latest API examples, correct import paths.

**Example queries:**
- `query: "AIProjectClient Azure AI Foundry", language: "typescript"`
- `query: "@github/copilot-sdk chat participant", language: "typescript"`
- `query: "DefaultAzureCredential token provider", language: "typescript"`

### 3. `microsoft-learn-microsoft_docs_fetch`

**Purpose:** Fetch a full Microsoft Learn page as markdown.

**Parameters:**
- `url` (string, required) — URL of a `microsoft.com` documentation page

**Returns:** Full page content as markdown with headings, code blocks, tables, and links.

**Best for:** Getting complete tutorials, full API reference pages, detailed procedures after identifying the right page via search.

**Constraint:** Only works with HTML pages on `microsoft.com`. No PDFs, images, or binary files.

## Usage Patterns

### Pattern 1: Search → Fetch (most common)

1. Use `microsoft_docs_search` to find relevant pages
2. Identify the most useful URL from results
3. Use `microsoft_docs_fetch` on that URL for full content

### Pattern 2: Code-First Lookup

When implementing Azure/Microsoft SDK code:
1. Use `microsoft_code_sample_search` with the SDK class/method name + language filter
2. Get working code snippets with correct imports and patterns
3. If more context needed, fetch the source URL from the snippet result

### Pattern 3: Direct Fetch

When you already know the exact doc URL (from a previous search, error message link, or user-provided URL):
1. Use `microsoft_docs_fetch` directly — skip search

## Routing Guidelines

**Use Microsoft Learn MCP when:**
- Task involves Azure services (AI Foundry, OpenAI, App Service, etc.)
- Agent needs current SDK API signatures or import paths
- Looking up VS Code Extension API or Copilot SDK docs
- Verifying Microsoft-specific configuration patterns
- Any question where the answer lives in Microsoft Learn

**Do NOT use when:**
- The question is about non-Microsoft technology
- You already have the answer from project files or history
- The agent needs to search GitHub repos (use GitHub MCP instead)

## Integration with Squad Agents

When spawning agents that may need Microsoft docs, include in the spawn prompt:

```
MCP TOOLS: microsoft-learn: ✅ (microsoft_docs_search, microsoft_code_sample_search, microsoft_docs_fetch). Use for Azure/Microsoft SDK lookups.
```

Agents receiving this context can call the tools directly — no additional discovery needed.

## Key Observations

- `microsoft_docs_search` returns chunked excerpts — good for quick answers but may truncate tables or multi-step procedures
- `microsoft_code_sample_search` returns snippets with `link` fields — always available for fetch follow-up
- `microsoft_docs_fetch` returns complete pages — use when search excerpts are insufficient
- The `language` filter on code sample search significantly improves result quality — always set it when the target language is known
- Results reflect the latest published Microsoft docs — more current than training data for rapidly-changing SDKs
