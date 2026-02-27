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
    apiKey: config.get<string>("apiKey", ""),
    model: config.get<string>("model", "gpt-4.1"),
    wireApi: config.get<string>("wireApi", "completions"),
    cliPath: config.get<string>("cliPath", ""),
  };
}

/** Checks SecretStorage first for the API key, falls back to settings.json. */
export async function getConfigurationAsync(
  secrets: vscode.SecretStorage
): Promise<ExtensionConfig> {
  const config = getConfiguration();
  const secretApiKey = await secrets.get("enclave.copilot.apiKey");
  if (secretApiKey) {
    config.apiKey = secretApiKey;
  }
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
        "Please configure the API key in Settings (enclave.copilot.apiKey)",
    });
  }

  return errors;
}
