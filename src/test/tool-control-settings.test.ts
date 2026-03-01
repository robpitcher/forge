/**
 * Tool Control Settings Tests — Issue #91
 *
 * Tests the `forge.excludedTools` setting.
 * Written BEFORE Childs's implementation lands. Tests will fail until
 * the feature is merged — that's expected. Tests define the contract.
 *
 * Expected behavior:
 *   - `excludedTools` defaults to `["url"]` when not configured
 *   - excludedTools is passed through to SDK SessionConfig on session creation
 *   - Empty/undefined values don't break session creation
 *   - Settings take effect on next conversation (no stale config)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import { getConfiguration, type ExtensionConfig } from "../configuration.js";
import {
  getOrCreateSession,
  removeSession,
  stopClient,
} from "../copilotService.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/openai/v1/",
  apiKey: "test-key-123",
  authMethod: "apiKey",
  model: "gpt-4.1",
  wireApi: "completions",
  cliPath: "",
};

function configWith(overrides: Record<string, unknown>): ExtensionConfig {
  return { ...baseConfig, ...overrides } as ExtensionConfig;
}

function setupVscodeConfig(settings: Record<string, unknown> = {}) {
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn(
      (key: string, defaultValue: unknown) => settings[key] ?? defaultValue,
    ),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Tool control settings (#91)", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
  });

  afterEach(async () => {
    await stopClient();
  });

  // =========================================================================
  // 1. Default excludedTools
  // =========================================================================
  describe("default excludedTools", () => {
    it("defaults excludedTools to ['url'] when no setting is configured", async () => {
      // getConfiguration should return excludedTools: ["url"] by default
      setupVscodeConfig(); // no overrides — all defaults

      const { getConfiguration } = await import("../configuration.js");
      const config = getConfiguration();
      const configAny = config as unknown as Record<string, unknown>;

      expect(configAny.excludedTools).toEqual(["url"]);
    });

    it("passes default excludedTools to SessionConfig when no override set", async () => {
      const config = configWith({ excludedTools: ["url"] });

      await getOrCreateSession("conv-default-excl", config, "test-key-123");

      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs.excludedTools).toEqual(["url"]);
    });
  });

  // =========================================================================
  // 2. Custom excludedTools
  // =========================================================================
  describe("custom excludedTools", () => {
    it("passes custom excludedTools array to SessionConfig", async () => {
      const config = configWith({ excludedTools: ["url", "shell", "write"] });

      await getOrCreateSession("conv-custom-excl", config, "test-key-123");

      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs.excludedTools).toEqual(["url", "shell", "write"]);
    });

    it("reads excludedTools from VS Code configuration", () => {
      setupVscodeConfig({ excludedTools: ["shell", "mcp"] });

      const config = getConfiguration();
      const configAny = config as unknown as Record<string, unknown>;

      expect(configAny.excludedTools).toEqual(["shell", "mcp"]);
    });
  });

  // =========================================================================
  // 3. Empty and undefined values don't break session creation
  // =========================================================================
  describe("empty and undefined values", () => {
    it("handles empty excludedTools array without error", async () => {
      const config = configWith({ excludedTools: [] });

      const session = await getOrCreateSession("conv-empty-excl", config, "test-key-123");

      expect(session).toBeDefined();
      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs.excludedTools).toEqual([]);
    });

    it("handles undefined excludedTools without error", async () => {
      const config = configWith({ excludedTools: undefined });

      const session = await getOrCreateSession("conv-undef-excl", config, "test-key-123");

      expect(session).toBeDefined();
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("creates session normally when tool setting is not configured", async () => {
      const session = await getOrCreateSession("conv-neither", baseConfig, "test-key-123");

      expect(session).toBeDefined();
      expect(mockClient.createSession).toHaveBeenCalledOnce();

      // Core session config should still be correct
      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs).toHaveProperty("model", "gpt-4.1");
      expect(sessionArgs).toHaveProperty("streaming", true);
    });
  });

  // =========================================================================
  // 4. Settings change takes effect on next conversation
  // =========================================================================
  describe("settings change on next conversation", () => {
    it("new conversation picks up changed excludedTools", async () => {
      // First conversation with default excludedTools
      const config1 = configWith({ excludedTools: ["url"] });
      await getOrCreateSession("conv-change-1", config1, "test-key-123");

      const firstArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;

      // Start a new conversation with updated excludedTools
      const config2 = configWith({ excludedTools: ["url", "shell"] });
      await getOrCreateSession("conv-change-2", config2, "test-key-123");

      const secondArgs = mockClient.createSession.mock.calls[1][0] as Record<string, unknown>;

      // Each conversation should use the config it was created with
      expect(firstArgs.excludedTools).toEqual(["url"]);
      expect(secondArgs.excludedTools).toEqual(["url", "shell"]);
    });

    it("removed session gets fresh config on recreation", async () => {
      const config1 = configWith({ excludedTools: ["url"] });
      await getOrCreateSession("conv-reuse", config1, "test-key-123");

      // Remove the session (simulates "new conversation" reset)
      removeSession("conv-reuse");

      // Re-create with different config
      const config2 = configWith({ excludedTools: ["shell"] });
      await getOrCreateSession("conv-reuse", config2, "test-key-123");

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);

      const firstArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      const secondArgs = mockClient.createSession.mock.calls[1][0] as Record<string, unknown>;

      expect(firstArgs.excludedTools).toEqual(["url"]);
      expect(secondArgs.excludedTools).toEqual(["shell"]);
    });

    it("cached session does NOT pick up config changes (by design)", async () => {
      const config1 = configWith({ excludedTools: ["url"] });
      await getOrCreateSession("conv-cached", config1, "test-key-123");

      // Same conversation ID with different config — should return cached session
      const config2 = configWith({ excludedTools: ["shell"] });
      await getOrCreateSession("conv-cached", config2, "test-key-123");

      // createSession should only have been called once (cached)
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });
  });
});
