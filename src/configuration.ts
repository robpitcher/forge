import * as vscode from "vscode";

export interface ExtensionConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  wireApi: string;
  cliPath: string;
}

export interface ConfigValidationError {
  field: string;
  message: string;
}

export function getConfiguration(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("enclave.copilot");
  return {
    endpoint: config.get<string>("endpoint", ""),
    apiKey: "",
    model: config.get<string>("model", "gpt-4.1"),
    wireApi: config.get<string>("wireApi", "completions"),
    cliPath: config.get<string>("cliPath", ""),
  };
}

/** Reads API key from SecretStorage and merges with settings. */
export async function getConfigurationAsync(
  secrets: vscode.SecretStorage
): Promise<ExtensionConfig> {
  const config = getConfiguration();
  const apiKey = await secrets.get("enclave.copilot.apiKey");
  config.apiKey = apiKey ?? "";
  return config;
}

export function validateConfiguration(
  config: ExtensionConfig
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (!config.endpoint) {
    errors.push({
      field: "enclave.copilot.endpoint",
      message:
        "Please configure the Azure AI Foundry endpoint in Settings (enclave.copilot.endpoint)",
    });
  }

  if (!config.apiKey) {
    errors.push({
      field: "enclave.copilot.apiKey",
      message:
        "Please set your API key via the ⚙️ gear menu → 'Set API Key (secure)'",
    });
  }

  return errors;
}
