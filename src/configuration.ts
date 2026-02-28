import * as vscode from "vscode";

export interface ExtensionConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  wireApi: string;
  cliPath: string;
  autoApproveTools: boolean;
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
    model: config.get<string>("model", "gpt-4.1"),
    wireApi: config.get<string>("wireApi", "completions"),
    cliPath: config.get<string>("cliPath", ""),
    autoApproveTools: config.get<boolean>("autoApproveTools", false),
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

  if (!config.apiKey) {
    errors.push({
      field: "forge.copilot.apiKey",
      message:
        "Please set your API key via the ⚙️ gear menu → 'Set API Key (secure)'",
    });
  }

  return errors;
}
