import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import {
  getConfiguration,
  getConfigurationAsync,
  validateConfiguration,
  type ExtensionConfig,
} from "../configuration.js";

describe("getConfiguration", () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReset();
  });

  it("reads VS Code settings with correct section and defaults", () => {
    const mockGet = vi.fn((_key: string, defaultValue: unknown) => defaultValue);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: mockGet,
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    const config = getConfiguration();

    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith(
      "forge.copilot"
    );
    expect(config).toEqual({
      endpoint: "",
      apiKey: "",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
      autoApproveTools: false,
    });
  });

  it("returns values from VS Code settings when configured (apiKey via SecretStorage)", async () => {
    const settings: Record<string, string> = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      model: "gpt-4o",
      wireApi: "responses",
      cliPath: "/usr/local/bin/copilot",
    };
    const mockGet = vi.fn(
      (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
    );
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: mockGet,
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    const mockSecrets = {
      get: vi.fn().mockImplementation((key: string) =>
        key === "forge.copilot.apiKey" ? Promise.resolve("test-key-123") : Promise.resolve(undefined)
      ),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    } as unknown as import("vscode").SecretStorage;

    const config = await getConfigurationAsync(mockSecrets);

    expect(config).toEqual({
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "test-key-123",
      model: "gpt-4o",
      wireApi: "responses",
      cliPath: "/usr/local/bin/copilot",
      autoApproveTools: false,
    });
  });
});

describe("validateConfiguration", () => {
  it("returns errors when endpoint and apiKey are missing", () => {
    const config: ExtensionConfig = {
      endpoint: "",
      apiKey: "",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    };

    const errors = validateConfiguration(config);

    expect(errors).toHaveLength(2);
    expect(errors[0].field).toBe("forge.copilot.endpoint");
    expect(errors[1].field).toBe("forge.copilot.apiKey");
  });

  it("returns error only for missing endpoint", () => {
    const config: ExtensionConfig = {
      endpoint: "",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    };

    const errors = validateConfiguration(config);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("forge.copilot.endpoint");
  });

  it("returns error only for missing apiKey", () => {
    const config: ExtensionConfig = {
      endpoint: "https://example.com",
      apiKey: "",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    };

    const errors = validateConfiguration(config);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("forge.copilot.apiKey");
  });

  it("returns no errors for valid config", () => {
    const config: ExtensionConfig = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "test-key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    };

    const errors = validateConfiguration(config);

    expect(errors).toHaveLength(0);
  });
});
