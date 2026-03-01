import * as vscode from "vscode";
import type { McpServerConfig } from "./types.js";

export interface ExtensionConfig {
  endpoint: string;
  apiKey: string;
  authMethod: "entraId" | "apiKey";
  model: string;
  wireApi: string;
  cliPath: string;
  autoApproveTools?: boolean;
  systemMessage?: string;
  toolShell: boolean;
  toolRead: boolean;
  toolWrite: boolean;
  toolUrl: boolean;
  toolMcp: boolean;
  mcpServers?: Record<string, McpServerConfig>;
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
    wireApi: config.get<string>("wireApi", "completions"),
    cliPath: config.get<string>("cliPath", ""),
    autoApproveTools: config.get<boolean>("autoApproveTools", false),
    systemMessage: config.get<string>("systemMessage", "") || undefined,
    toolShell: config.get<boolean>("tools.shell", true),
    toolRead: config.get<boolean>("tools.read", true),
    toolWrite: config.get<boolean>("tools.write", true),
    toolUrl: config.get<boolean>("tools.url", false),
    toolMcp: config.get<boolean>("tools.mcp", true),
    mcpServers: config.get<Record<string, McpServerConfig>>("mcpServers") || undefined,
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
      if (!server.command || typeof server.command !== "string") {
        errors.push({
          field,
          message: `MCP server "${name}" requires a non-empty "command" string. Set the command to start the server process.`,
        });
      }
      if (server.args !== undefined) {
        if (!Array.isArray(server.args) || !server.args.every((a) => typeof a === "string")) {
          errors.push({
            field,
            message: `MCP server "${name}" has invalid "args" — must be an array of strings.`,
          });
        }
      }
      if (server.env !== undefined) {
        if (
          typeof server.env !== "object" ||
          server.env === null ||
          Array.isArray(server.env) ||
          !Object.values(server.env).every((v) => typeof v === "string")
        ) {
          errors.push({
            field,
            message: `MCP server "${name}" has invalid "env" — must be an object with string values.`,
          });
        }
      }
    }
  }

  return errors;
}
