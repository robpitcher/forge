import * as vscode from "vscode";
import type { McpServerConfig, RemoteMcpSettings } from "./types.js";

export interface ExtensionConfig {
  endpoint: string;
  apiKey: string;
  authMethod: "entraId" | "apiKey";
  model: string;
  models: string[];
  wireApi: string;
  cliPath: string;
  autoApproveTools?: boolean;
  systemMessage?: string;
  toolShell: boolean;
  toolRead: boolean;
  toolWrite: boolean;
  toolUrl: boolean;
  toolMcp: boolean;
  allowRemoteMcp?: boolean;
  mcpServers?: Record<string, McpServerConfig | RemoteMcpSettings>;
}

export interface ConfigValidationError {
  field: string;
  message: string;
}

export function getConfiguration(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("forge.copilot");
  return {
    endpoint: config.get<string>("endpoint", ""),
    apiKey: "",
    authMethod: config.get<string>("authMethod", "entraId") as "entraId" | "apiKey",
    model: config.get<string>("model", "gpt-4.1"),
    models: config.get<string[]>("models", ["gpt-4.1", "gpt-4o", "gpt-4o-mini"]),
    wireApi: config.get<string>("wireApi", "completions"),
    cliPath: config.get<string>("cliPath", ""),
    autoApproveTools: config.get<boolean>("autoApproveTools", false),
    systemMessage: config.get<string>("systemMessage", "") || undefined,
    toolShell: config.get<boolean>("tools.shell", true),
    toolRead: config.get<boolean>("tools.read", true),
    toolWrite: config.get<boolean>("tools.write", true),
    toolUrl: config.get<boolean>("tools.url", false),
    toolMcp: config.get<boolean>("tools.mcp", true),
    allowRemoteMcp: config.get<boolean>("mcpAllowRemote", false) || undefined,
    mcpServers: config.get<Record<string, McpServerConfig | RemoteMcpSettings>>("mcpServers") || undefined,
  };
}

/** Reads API key from SecretStorage and merges with settings. */
export async function getConfigurationAsync(
  secrets: vscode.SecretStorage
): Promise<ExtensionConfig> {
  const config = getConfiguration();
  const apiKey = await secrets.get("forge.copilot.apiKey");
  config.apiKey = apiKey ?? "";
  return config;
}

export function validateConfiguration(
  config: ExtensionConfig
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (!config.endpoint) {
    errors.push({
      field: "forge.copilot.endpoint",
      message:
        "Please configure the Azure AI Foundry endpoint in Settings (forge.copilot.endpoint)",
    });
  }

  if (config.authMethod === "apiKey" && !config.apiKey) {
    errors.push({
      field: "forge.copilot.apiKey",
      message:
        "Please set your API key via the ⚙️ gear menu → 'Set API Key (secure)'",
    });
  }

  if (config.mcpServers) {
    for (const [name, server] of Object.entries(config.mcpServers)) {
      const field = `forge.copilot.mcpServers.${name}`;
      const s = server as unknown as Record<string, unknown>;
      const hasCommand = "command" in s && s.command;
      const hasUrl = "url" in s && s.url;

      if (hasCommand && hasUrl) {
        errors.push({
          field,
          message: `MCP server "${name}" has both "command" and "url". Use "command" for local servers or "url" for remote servers, not both.`,
        });
        continue;
      }

      const isRemote = hasUrl && !hasCommand;
      const isLocal = hasCommand;

      if (!isLocal && !isRemote) {
        errors.push({
          field,
          message: `MCP server "${name}" requires either a "command" (local) or a "url" (remote).`,
        });
        continue;
      }

      if (isRemote) {
        // Remote server validation
        const remote = server as RemoteMcpSettings;
        if (!config.allowRemoteMcp) {
          errors.push({
            field,
            message: `Remote MCP servers are disabled. Enable forge.copilot.mcpAllowRemote to allow remote (HTTP/SSE) servers.`,
          });
        }
        if (!remote.url || typeof remote.url !== "string") {
          errors.push({
            field,
            message: `MCP server "${name}" requires a non-empty "url" for remote servers.`,
          });
        }
        if (remote.headers !== undefined) {
          if (
            typeof remote.headers !== "object" ||
            remote.headers === null ||
            Array.isArray(remote.headers) ||
            !Object.values(remote.headers).every((v) => typeof v === "string")
          ) {
            errors.push({
              field,
              message: `MCP server "${name}" has invalid "headers" — must be an object with string values.`,
            });
          }
        }
      } else {
        // Local server validation
        const local = server as McpServerConfig;
        if (!local.command || typeof local.command !== "string") {
          errors.push({
            field,
            message: `MCP server "${name}" requires a non-empty "command" string. Set the command to start the server process.`,
          });
        }
        if (local.args !== undefined) {
          if (!Array.isArray(local.args) || !local.args.every((a) => typeof a === "string")) {
            errors.push({
              field,
              message: `MCP server "${name}" has invalid "args" — must be an array of strings.`,
            });
          }
        }
        if (local.env !== undefined) {
          if (
            typeof local.env !== "object" ||
            local.env === null ||
            Array.isArray(local.env) ||
            !Object.values(local.env).every((v) => typeof v === "string")
          ) {
            errors.push({
              field,
              message: `MCP server "${name}" has invalid "env" — must be an object with string values.`,
            });
          }
        }
      }
    }
  }

  return errors;
}
