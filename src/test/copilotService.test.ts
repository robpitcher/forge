import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  constructorSpy,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import type { ExtensionConfig } from "../configuration.js";
import {
  getOrCreateClient,
  getOrCreateSession,
  removeSession,
  stopClient,
  validateCopilotCli,
  discoverAndValidateCli,
  probeCliCompatibility,
} from "../copilotService.js";
import { execSync, execFileSync, spawn } from "child_process";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

vi.mock("child_process", () => ({
  execSync: vi.fn().mockReturnValue("/usr/local/bin/copilot\n"),
  execFileSync: vi.fn().mockReturnValue("1.0.2"),
  spawn: vi.fn(() => ({
    pid: 12345,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    on: vi.fn().mockReturnThis(),
    stderr: {
      on: vi.fn().mockReturnThis(),
    },
  })),
}));

const validConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/",
  apiKey: "test-key-123",
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

// Configs for #27 auth method tests
const apiKeyConfig: ExtensionConfig = {
  ...validConfig,
  authMethod: "apiKey",
};

const entraIdConfig: ExtensionConfig = {
  ...validConfig,
  apiKey: "",
  authMethod: "entraId",
};

describe("copilotService", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
    constructorSpy.mockClear();
  });

  afterEach(async () => {
    await stopClient();
  });

  describe("getOrCreateClient", () => {
    const mockExecSync = vi.mocked(execSync);
    const mockExecFileSync = vi.mocked(execFileSync);

    beforeEach(() => {
      mockExecSync.mockClear();
      mockExecSync.mockReturnValue("/usr/local/bin/copilot\n");
      mockExecFileSync.mockClear();
      mockExecFileSync.mockReturnValue("1.0.2");
    });

    it("creates a client and starts it", async () => {
      const client = await getOrCreateClient(validConfig);

      expect(client).toBeDefined();
      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("reuses existing client on second call", async () => {
      const client1 = await getOrCreateClient(validConfig);
      const client2 = await getOrCreateClient(validConfig);

      expect(client1).toBe(client2);
      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("passes cliPath when configured", async () => {
      const configWithCli = { ...validConfig, cliPath: "/custom/path/copilot" };
      mockExecFileSync.mockReturnValueOnce("@github/copilot v1.2.3\n");

      await getOrCreateClient(configWithCli);

      expect(constructorSpy).toHaveBeenCalledWith({
        cliPath: "/custom/path/copilot",
      });
    });

    it("fails early with actionable error for invalid configured cliPath", async () => {
      const configWithCli = { ...validConfig, cliPath: "/custom/path/copilot" };
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error("unknown option: --version");
      });

      await expect(getOrCreateClient(configWithCli)).rejects.toMatchObject({
        name: "CopilotCliNotFoundError",
        message: expect.stringContaining("The configured Copilot CLI path is invalid"),
      });
      expect(constructorSpy).not.toHaveBeenCalled();
      expect(mockClient.start).not.toHaveBeenCalled();
    });

    it("fails early with directory-path guidance when cliPath points to directory", async () => {
      const configWithCli = { ...validConfig, cliPath: process.cwd() };

      await expect(getOrCreateClient(configWithCli)).rejects.toMatchObject({
        name: "CopilotCliNotFoundError",
        message: expect.stringContaining("forge.copilot.cliPath points to a directory"),
      });
      expect(constructorSpy).not.toHaveBeenCalled();
      expect(mockClient.start).not.toHaveBeenCalled();
    });

    it("includes attempted cli path and startup error details when startup fails", async () => {
      const configWithCli = { ...validConfig, cliPath: "/custom/path/copilot" };
      mockExecFileSync.mockReturnValueOnce("GitHub Copilot CLI 0.0.421-1\n");
      mockClient.start.mockRejectedValueOnce(new Error("unknown option: --headless"));

      let thrown: unknown;
      try {
        await getOrCreateClient(configWithCli);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain("Attempted CLI path: /custom/path/copilot");
      expect(message).toContain("Startup error: unknown option: --headless");
      expect(message).not.toContain("npm install -g @github/copilot");
    });
  });

  describe("getOrCreateSession", () => {
    it("creates a session with correct config", async () => {
      const session = await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");

      expect(session).toBeDefined();
      expect(mockClient.createSession).toHaveBeenCalledWith({
        sessionId: "conv-1",
        model: "gpt-4.1",
        provider: {
          type: "azure",
          baseUrl: validConfig.endpoint,
          apiKey: "test-key-123",
          wireApi: validConfig.wireApi,
          azure: { apiVersion: "2024-10-21" },
        },
        streaming: true,
        excludedTools: ["url"],
        onPermissionRequest: expect.any(Function),
      });
    });

    it("reuses existing session for same conversationId", async () => {
      const session1 = await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");
      const session2 = await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");

      expect(session1).toBe(session2);
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("creates separate sessions for different conversationIds", async () => {
      await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");
      await getOrCreateSession("conv-2", validConfig, "test-key-123", "gpt-4.1");

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });

    it("uses model parameter instead of config for session creation", async () => {
      await getOrCreateSession("conv-model-param", validConfig, "test-key-123", "gpt-4o-mini");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o-mini" })
      );
    });

    // --- #27 auth method tests ---
    // These tests validate the authToken parameter and ProviderConfig wiring.
    // They will pass once Childs updates getOrCreateSession to accept authToken.

    it("passes bearerToken on ProviderConfig when authMethod is 'entraId'", async () => {
      await getOrCreateSession("conv-entra", entraIdConfig, "entra-bearer-token-xyz", "gpt-4.1");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            bearerToken: "entra-bearer-token-xyz",
          }),
        }),
      );
      // Should NOT have apiKey set when using entraId
      const callArgs = mockClient.createSession.mock.calls[0][0];
      expect(callArgs.provider.apiKey).toBeUndefined();
    });

    it("passes apiKey on ProviderConfig when authMethod is 'apiKey'", async () => {
      await getOrCreateSession("conv-apikey", apiKeyConfig, "my-api-key-secret", "gpt-4.1");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            apiKey: "my-api-key-secret",
          }),
        }),
      );
      // Should NOT have bearerToken set when using apiKey
      const callArgs = mockClient.createSession.mock.calls[0][0];
      expect(callArgs.provider.bearerToken).toBeUndefined();
    });

    it("sets azure provider config correctly with entraId auth", async () => {
      await getOrCreateSession("conv-entra-azure", entraIdConfig, "azure-token", "gpt-4.1");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            type: "azure",
            baseUrl: entraIdConfig.endpoint,
            bearerToken: "azure-token",
            azure: { apiVersion: "2024-10-21" },
          }),
        }),
      );
    });
    // --- #91 tool control tests ---

    it("passes excludedTools to createSession when configured", async () => {
      const configWithExcluded = { ...validConfig, excludedTools: ["url"] };
      await getOrCreateSession("conv-excluded", configWithExcluded, "test-key-123", "gpt-4.1");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          excludedTools: ["url"],
        }),
      );
    });

    it("does not pass excludedTools when all tools enabled", async () => {
      const configAllEnabled: ExtensionConfig = {
        ...validConfig,
        toolUrl: true,
      };
      await getOrCreateSession("conv-none", configAllEnabled, "test-key-123", "gpt-4.1");

      const callArgs = mockClient.createSession.mock.calls[0][0];
      expect(callArgs.excludedTools).toBeUndefined();
    });
  });

  describe("removeSession", () => {
    it("removes a session so next call creates a new one", async () => {
      await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");
      removeSession("conv-1");
      await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });
  });

  describe("stopClient", () => {
    it("stops client and clears sessions", async () => {
      await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");

      await stopClient();

      expect(mockClient.stop).toHaveBeenCalledOnce();

      // After stop, a new client should be created
      const newMockSession = createMockSession();
      const newMockClient = createMockClient(newMockSession);
      setMockClient(newMockClient);

      await getOrCreateClient(validConfig);
      expect(newMockClient.start).toHaveBeenCalledOnce();
    });

    it("clears sessions so they are recreated", async () => {
      await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");
      await stopClient();

      // Re-setup mock for new client
      const newMockSession = createMockSession();
      const newMockClient = createMockClient(newMockSession);
      setMockClient(newMockClient);

      await getOrCreateSession("conv-1", validConfig, "test-key-123", "gpt-4.1");
      expect(newMockClient.createSession).toHaveBeenCalledOnce();
    });
  });

  describe("validateCopilotCli", () => {
    const mockExecFileSync = vi.mocked(execFileSync);

    beforeEach(() => {
      mockExecFileSync.mockReset();
    });

    it("returns valid result when CLI returns version", async () => {
      mockExecFileSync.mockReturnValue("@github/copilot v1.2.3\n");

      const result = await validateCopilotCli("/usr/local/bin/copilot");

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.version).toBe("@github/copilot v1.2.3");
        expect(result.path).toBe("/usr/local/bin/copilot");
      }
    });

    it("accepts standard GitHub Copilot CLI version output", async () => {
      mockExecFileSync.mockReturnValue("GitHub Copilot CLI 0.0.421-1\n");

      const result = await validateCopilotCli("/usr/local/bin/copilot");

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.version).toBe("GitHub Copilot CLI 0.0.421-1");
      }
    });

    it("returns wrong_binary when CLI returns error", async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("unknown option: --version");
      });

      const result = await validateCopilotCli("/usr/bin/copilot");

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("wrong_binary");
        expect(result.path).toBe("/usr/bin/copilot");
        expect(result.details).toContain("unknown option");
      }
    });

    it("returns not_found when CLI binary does not exist", async () => {
      mockExecFileSync.mockImplementation(() => {
        const err: Error & { code?: string } = new Error("Command failed: copilot --version");
        err.message = "ENOENT: no such file or directory";
        throw err;
      });

      const result = await validateCopilotCli("/nonexistent/copilot");

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("not_found");
        expect(result.path).toBe("/nonexistent/copilot");
      }
    });

    it("returns version_check_failed when CLI returns empty output", async () => {
      mockExecFileSync.mockReturnValue("");

      const result = await validateCopilotCli("/usr/local/bin/copilot");

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("version_check_failed");
        expect(result.details).toBe("No version output returned");
      }
    });

    it("handles timeout error as wrong_binary", async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("Command timed out");
      });

      const result = await validateCopilotCli("/usr/bin/copilot");

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("wrong_binary");
      }
    });

    it("returns version_check_failed for directory path with actionable details", async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("EISDIR: illegal operation on a directory");
      });

      const result = await validateCopilotCli(process.cwd());

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("version_check_failed");
        expect(result.details).toContain("points to a directory");
      }
    });

    it("prepends node for .js CLI paths", async () => {
      mockExecFileSync.mockReturnValue("@github/copilot v1.2.3\n");

      const result = await validateCopilotCli("/path/to/npm-loader.js");

      expect(result.valid).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        process.execPath,
        ["/path/to/npm-loader.js", "--version"],
        expect.any(Object)
      );
    });

    it("does not prepend node for non-.js CLI paths", async () => {
      mockExecFileSync.mockReturnValue("@github/copilot v1.2.3\n");

      const result = await validateCopilotCli("/usr/local/bin/copilot");

      expect(result.valid).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "/usr/local/bin/copilot",
        ["--version"],
        expect.any(Object)
      );
    });

    it("prepends node for case-insensitive .JS paths (Windows)", async () => {
      mockExecFileSync.mockReturnValue("@github/copilot v1.2.3\n");

      const result = await validateCopilotCli("C:\\Path\\To\\npm-loader.JS");

      expect(result.valid).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        process.execPath,
        ["C:\\Path\\To\\npm-loader.JS", "--version"],
        expect.any(Object)
      );
    });
  });

  describe("probeCliCompatibility", () => {
    const mockSpawn = vi.mocked(spawn);

    beforeEach(() => {
      mockSpawn.mockReset();
    });

    it("prepends node for .js CLI paths", async () => {
      const mockChild = {
        pid: 12345,
        exitCode: null,
        signalCode: null,
        kill: vi.fn(),
        on: vi.fn().mockReturnThis(),
        stderr: { on: vi.fn().mockReturnThis() },
      };
      mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      // Probe starts a timer; resolve after grace period
      const probePromise = probeCliCompatibility("/path/to/npm-loader.js");

      // Let the grace timer fire
      await vi.waitFor(async () => {
        const result = await probePromise;
        expect(result.compatible).toBe(true);
      }, { timeout: 2000 });

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        ["/path/to/npm-loader.js", "--headless", "--no-auto-update", "--stdio"],
        expect.any(Object)
      );
    });

    it("does not prepend node for non-.js CLI paths", async () => {
      const mockChild = {
        pid: 12345,
        exitCode: null,
        signalCode: null,
        kill: vi.fn(),
        on: vi.fn().mockReturnThis(),
        stderr: { on: vi.fn().mockReturnThis() },
      };
      mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      const probePromise = probeCliCompatibility("/usr/local/bin/copilot");

      await vi.waitFor(async () => {
        const result = await probePromise;
        expect(result.compatible).toBe(true);
      }, { timeout: 2000 });

      expect(mockSpawn).toHaveBeenCalledWith(
        "/usr/local/bin/copilot",
        ["--headless", "--no-auto-update", "--stdio"],
        expect.any(Object)
      );
    });
  });

  describe("discoverAndValidateCli", () => {
    const mockExecSync = vi.mocked(execSync);
    const mockExecFileSync = vi.mocked(execFileSync);

    beforeEach(() => {
      mockExecSync.mockReset();
      mockExecFileSync.mockReset();
    });

    it("validates configured path when provided", async () => {
      mockExecFileSync.mockReturnValue("@github/copilot v1.2.3\n");

      const result = await discoverAndValidateCli("/custom/path/copilot");

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.path).toBe("/custom/path/copilot");
      }
    });

    it("does not discover from PATH on Windows when globalStoragePath is provided", async () => {
      const missingStoragePath = `${process.cwd()}/.tmp-missing-managed-cli-${Date.now()}`;
      const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
      mockExecSync.mockReturnValueOnce("/usr/local/bin/copilot\n");

      try {
        Object.defineProperty(process, "platform", { value: "win32" });

        const result = await discoverAndValidateCli(undefined, missingStoragePath);

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.reason).toBe("not_found");
          expect(result.details).toContain("managed Copilot CLI");
        }
        expect(mockExecSync).not.toHaveBeenCalled();
      } finally {
        if (originalPlatform) {
          Object.defineProperty(process, "platform", originalPlatform);
        }
      }
    });

    it("discovers and validates CLI from PATH when no config", async () => {
      // First call (execSync): which/where copilot
      mockExecSync.mockReturnValueOnce("/usr/local/bin/copilot\n");
      // Second call (execFileSync): copilot --version
      mockExecFileSync.mockReturnValueOnce("@github/copilot v1.2.3\n");

      const result = await discoverAndValidateCli();

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.path).toBe("/usr/local/bin/copilot");
      }
    });

    it("returns not_found when no CLI on PATH and no config", async () => {
      // which/where fails
      mockExecSync.mockImplementation(() => {
        throw new Error("Command failed");
      });

      const result = await discoverAndValidateCli();

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("not_found");
        expect(result.details).toContain("No copilot binary found on PATH");
      }
    });

    it("validates discovered CLI and reports wrong_binary", async () => {
      // First call (execSync): which/where finds a copilot
      mockExecSync.mockReturnValueOnce("/usr/bin/copilot\n");
      // Second call (execFileSync): copilot --version fails
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error("unknown option: --version");
      });

      const result = await discoverAndValidateCli();

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("wrong_binary");
        expect(result.path).toBe("/usr/bin/copilot");
      }
    });

    it("ignores empty configured path and discovers from PATH", async () => {
      mockExecSync.mockReturnValueOnce("/usr/local/bin/copilot\n");
      mockExecFileSync.mockReturnValueOnce("@github/copilot v1.2.3\n");

      const result = await discoverAndValidateCli("   ");

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.path).toBe("/usr/local/bin/copilot");
      }
    });
  });
});
