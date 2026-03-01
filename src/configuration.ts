import * as vscode from "vscode";

export interface ExtensionConfig {
  endpoint: string;
  apiKey: string;
  authMethod: "entraId" | "apiKey";
  model: string;
  wireApi: string;
  cliPath: string;
  autoApproveTools?: boolean;
  systemMessage?: string;
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

  return errors;
}
