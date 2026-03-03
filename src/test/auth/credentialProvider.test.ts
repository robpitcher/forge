import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionConfig } from "../../configuration.js";

// Mock @azure/identity before importing the module under test.
// createCredentialProvider uses dynamic import(), so we mock at module level.
const mockGetToken = vi.fn();

vi.mock("@azure/identity", () => {
  return {
    DefaultAzureCredential: class MockDefaultAzureCredential {
      getToken = mockGetToken;
    },
  };
});

// Mock child_process for execSync used in auto-recovery
vi.mock("child_process", () => {
  return {
    execSync: vi.fn(),
  };
});

// Mock vscode SecretStorage for the factory function
function createMockSecrets(apiKey?: string) {
  return {
    get: vi.fn().mockImplementation((key: string) =>
      key === "forge.copilot.apiKey"
        ? Promise.resolve(apiKey)
        : Promise.resolve(undefined),
    ),
    store: vi.fn(),
    delete: vi.fn(),
    onDidChange: vi.fn(),
  } as unknown as import("vscode").SecretStorage;
}

import {
  ApiKeyCredentialProvider,
  EntraIdCredentialProvider,
  createCredentialProvider,
} from "../../auth/credentialProvider.js";

describe("ApiKeyCredentialProvider", () => {
  it("getToken() returns the stored API key", async () => {
    const provider = new ApiKeyCredentialProvider("my-secret-key-123");

    const token = await provider.getToken();

    expect(token).toBe("my-secret-key-123");
  });

  it("getToken() returns the same key on repeated calls", async () => {
    const provider = new ApiKeyCredentialProvider("stable-key");

    const token1 = await provider.getToken();
    const token2 = await provider.getToken();

    expect(token1).toBe("stable-key");
    expect(token2).toBe("stable-key");
  });

  it("getToken() returns empty string when constructed with empty key", async () => {
    const provider = new ApiKeyCredentialProvider("");

    const token = await provider.getToken();

    expect(token).toBe("");
  });
});

describe("EntraIdCredentialProvider", () => {
  beforeEach(() => {
    mockGetToken.mockReset();
  });

  it("getToken() calls DefaultAzureCredential.getToken with cognitive services scope", async () => {
    mockGetToken.mockResolvedValue({ token: "entra-token-abc", expiresOnTimestamp: Date.now() + 3600000 });

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });
    await provider.getToken();

    expect(mockGetToken).toHaveBeenCalledWith(
      "https://cognitiveservices.azure.com/.default",
    );
  });

  it("getToken() returns just the token string, not the full AccessToken object", async () => {
    const accessTokenObject = { token: "raw-bearer-token-xyz", expiresOnTimestamp: Date.now() + 3600000 };
    mockGetToken.mockResolvedValue(accessTokenObject);

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });
    const result = await provider.getToken();

    expect(result).toBe("raw-bearer-token-xyz");
    expect(result).not.toEqual(accessTokenObject);
  });

  it("getToken() surfaces errors from DefaultAzureCredential", async () => {
    mockGetToken.mockRejectedValue(
      new Error("AggregateAuthenticationError: No credential in the chain provided a token"),
    );

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });

    await expect(provider.getToken()).rejects.toThrow(
      "AggregateAuthenticationError",
    );
  });

  it("getToken() surfaces CredentialUnavailableError from DefaultAzureCredential", async () => {
    const credError = new Error("CredentialUnavailableError: Azure CLI not found");
    credError.name = "CredentialUnavailableError";
    mockGetToken.mockRejectedValue(credError);

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });

    await expect(provider.getToken()).rejects.toThrow("Azure CLI not found");
  });

  it("getToken() calls DefaultAzureCredential fresh each time (SDK handles caching)", async () => {
    mockGetToken
      .mockResolvedValueOnce({ token: "token-1", expiresOnTimestamp: Date.now() + 3600000 })
      .mockResolvedValueOnce({ token: "token-2", expiresOnTimestamp: Date.now() + 3600000 });

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });
    const first = await provider.getToken();
    const second = await provider.getToken();

    expect(first).toBe("token-1");
    expect(second).toBe("token-2");
    expect(mockGetToken).toHaveBeenCalledTimes(2);
  });

  it("auto-recovers when 'No subscription found' error occurs", async () => {
    // First call fails with subscription error, second succeeds
    mockGetToken
      .mockRejectedValueOnce(new Error("No subscription found. Run 'az account set'"))
      .mockResolvedValueOnce({ token: "recovered-token", expiresOnTimestamp: Date.now() + 3600000 });

    // Mock execSync to simulate az cli commands
    const { execSync } = await import("child_process");
    const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === "az account list --output json") {
        return JSON.stringify([
          { id: "sub-123", name: "My Subscription", state: "Enabled", isDefault: false },
        ]);
      }
      return "";
    });

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });
    const token = await provider.getToken();

    expect(token).toBe("recovered-token");
    expect(mockGetToken).toHaveBeenCalledTimes(2);
  });

  it("auto-recovery only attempts once per provider instance", async () => {
    // Both calls fail with subscription error
    mockGetToken
      .mockRejectedValue(new Error("No subscription found. Run 'az account set'"));

    // Mock execSync to fail (no subscriptions)
    const { execSync } = await import("child_process");
    const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
    mockExecSync.mockImplementation(() => {
      return JSON.stringify([]);
    });

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });
    
    // First call attempts recovery and fails (autoSelectSubscription throws, so no retry getToken)
    await expect(provider.getToken()).rejects.toThrow("Azure authentication failed");
    
    // Second call should NOT attempt recovery again — just throw the original error
    await expect(provider.getToken()).rejects.toThrow("No subscription found");
    
    // getToken should be called 2 times: initial (first call), then second call (no retry)
    expect(mockGetToken).toHaveBeenCalledTimes(2);
  });

  it("auto-recovery fails gracefully when no enabled subscriptions exist", async () => {
    mockGetToken
      .mockRejectedValueOnce(new Error("No subscription found"))
      .mockRejectedValueOnce(new Error("Still no subscription"));

    // Mock execSync to return disabled subscription
    const { execSync } = await import("child_process");
    const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === "az account list --output json") {
        return JSON.stringify([
          { id: "sub-999", name: "Disabled Sub", state: "Disabled", isDefault: false },
        ]);
      }
      return "";
    });

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });
    
    await expect(provider.getToken()).rejects.toThrow("Azure authentication failed");
  });

  it("does not attempt recovery for non-subscription errors", async () => {
    mockGetToken.mockRejectedValue(new Error("Network error"));

    const provider = new EntraIdCredentialProvider({ getToken: mockGetToken });
    
    // Should throw immediately without attempting recovery
    await expect(provider.getToken()).rejects.toThrow("Network error");
    
    // Only called once (no retry)
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });
});

describe("createCredentialProvider", () => {
  beforeEach(() => {
    mockGetToken.mockReset();
  });

  it("returns ApiKeyCredentialProvider when authMethod is 'apiKey'", async () => {
    const config: ExtensionConfig = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "",
      authMethod: "apiKey",
      models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
      wireApi: "completions",
      cliPath: "",
      toolShell: true,
      toolRead: true,
      toolWrite: true,
      toolUrl: false,
      toolMcp: true,
    };

    const provider = await createCredentialProvider(config, createMockSecrets("key-from-secrets"));

    expect(provider).toBeInstanceOf(ApiKeyCredentialProvider);
  });

  it("returns EntraIdCredentialProvider when authMethod is 'entraId'", async () => {
    const config: ExtensionConfig = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "",
      authMethod: "entraId",
      models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
      wireApi: "completions",
      cliPath: "",
      toolShell: true,
      toolRead: true,
      toolWrite: true,
      toolUrl: false,
      toolMcp: true,
    };

    const provider = await createCredentialProvider(config, createMockSecrets());

    expect(provider).toBeInstanceOf(EntraIdCredentialProvider);
  });

  it("ApiKeyCredentialProvider from factory reads key from SecretStorage", async () => {
    const config: ExtensionConfig = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "",
      authMethod: "apiKey",
      models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
      wireApi: "completions",
      cliPath: "",
      toolShell: true,
      toolRead: true,
      toolWrite: true,
      toolUrl: false,
      toolMcp: true,
    };

    const provider = await createCredentialProvider(config, createMockSecrets("factory-key-456"));
    const token = await provider.getToken();

    expect(token).toBe("factory-key-456");
  });

  it("EntraIdCredentialProvider from factory calls Azure credential", async () => {
    mockGetToken.mockResolvedValue({ token: "entra-factory-token", expiresOnTimestamp: Date.now() + 3600000 });

    const config: ExtensionConfig = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "",
      authMethod: "entraId",
      models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
      wireApi: "completions",
      cliPath: "",
      toolShell: true,
      toolRead: true,
      toolWrite: true,
      toolUrl: false,
      toolMcp: true,
    };

    const provider = await createCredentialProvider(config, createMockSecrets());
    const token = await provider.getToken();

    expect(token).toBe("entra-factory-token");
  });

  it("ApiKeyCredentialProvider from factory returns empty string when no key in SecretStorage", async () => {
    const config: ExtensionConfig = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "",
      authMethod: "apiKey",
      models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
      wireApi: "completions",
      cliPath: "",
      toolShell: true,
      toolRead: true,
      toolWrite: true,
      toolUrl: false,
      toolMcp: true,
    };

    const provider = await createCredentialProvider(config, createMockSecrets());
    const token = await provider.getToken();

    expect(token).toBe("");
  });
});
