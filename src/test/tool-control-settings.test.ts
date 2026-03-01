/**
 * Tool Control Settings Tests — Issue #91
 *
 * Tests the individual `forge.copilot.tools.*` boolean settings.
 * Each tool has its own checkbox, defaulting to enabled (true)
 * except `url` which defaults to false for air-gap compliance.
 *
 * Expected behavior:
 *   - Individual tool booleans compute `excludedTools` array for SDK
 *   - Default config excludes only `url`
 *   - Disabling tools adds them to excludedTools
 *   - All tools enabled means no excludedTools passed to SDK
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
  models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
  wireApi: "completions",
  cliPath: "",
  toolShell: true,
  toolRead: true,
  toolWrite: true,
  toolUrl: false,
  toolMcp: true,
};

function configWith(overrides: Partial<ExtensionConfig>): ExtensionConfig {
  return { ...baseConfig, ...overrides };
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
  // 1. Default tool settings
  // =========================================================================
  describe("default tool settings", () => {
    it("defaults url to false and all others to true", () => {
      setupVscodeConfig(); // no overrides — all defaults

      const config = getConfiguration();

      expect(config.toolShell).toBe(true);
      expect(config.toolRead).toBe(true);
      expect(config.toolWrite).toBe(true);
      expect(config.toolUrl).toBe(false);
      expect(config.toolMcp).toBe(true);
    });

    it("passes default excludedTools (url only) to SessionConfig", async () => {
      const config = configWith({}); // default: toolUrl=false

      await getOrCreateSession("conv-default-excl", config, "test-key-123");

      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs.excludedTools).toEqual(["url"]);
    });
  });

  // =========================================================================
  // 2. Custom tool settings
  // =========================================================================
  describe("custom tool settings", () => {
    it("excludes multiple disabled tools", async () => {
      const config = configWith({ toolUrl: false, toolShell: false, toolWrite: false });

      await getOrCreateSession("conv-custom-excl", config, "test-key-123");

      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs.excludedTools).toEqual(expect.arrayContaining(["shell", "write", "url"]));
      expect((sessionArgs.excludedTools as string[]).length).toBe(3);
    });

    it("reads tool booleans from VS Code configuration", () => {
      setupVscodeConfig({ "tools.shell": false, "tools.mcp": false });

      const config = getConfiguration();

      expect(config.toolShell).toBe(false);
      expect(config.toolMcp).toBe(false);
    });
  });

  // =========================================================================
  // 3. All tools enabled — no excludedTools
  // =========================================================================
  describe("all tools enabled", () => {
    it("does not pass excludedTools when all tools are enabled", async () => {
      const config = configWith({ toolUrl: true }); // all true

      const session = await getOrCreateSession("conv-all-enabled", config, "test-key-123");

      expect(session).toBeDefined();
      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs.excludedTools).toBeUndefined();
    });

    it("creates session normally with all tools enabled", async () => {
      const config = configWith({ toolUrl: true });
      const session = await getOrCreateSession("conv-all-ok", config, "test-key-123");

      expect(session).toBeDefined();
      expect(mockClient.createSession).toHaveBeenCalledOnce();

      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs).toHaveProperty("model", "gpt-4.1");
      expect(sessionArgs).toHaveProperty("streaming", true);
    });
  });

  // =========================================================================
  // 4. Settings change takes effect on next conversation
  // =========================================================================
  describe("settings change on next conversation", () => {
    it("new conversation picks up changed tool settings", async () => {
      // First conversation with default (url disabled)
      const config1 = configWith({});
      await getOrCreateSession("conv-change-1", config1, "test-key-123");

      const firstArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;

      // Start a new conversation with shell also disabled
      const config2 = configWith({ toolShell: false });
      await getOrCreateSession("conv-change-2", config2, "test-key-123");

      const secondArgs = mockClient.createSession.mock.calls[1][0] as Record<string, unknown>;

      expect(firstArgs.excludedTools).toEqual(["url"]);
      expect(secondArgs.excludedTools).toEqual(expect.arrayContaining(["shell", "url"]));
    });

    it("removed session gets fresh config on recreation", async () => {
      const config1 = configWith({});
      await getOrCreateSession("conv-reuse", config1, "test-key-123");

      removeSession("conv-reuse");

      // Re-create with shell disabled
      const config2 = configWith({ toolShell: false, toolUrl: true });
      await getOrCreateSession("conv-reuse", config2, "test-key-123");

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);

      const firstArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      const secondArgs = mockClient.createSession.mock.calls[1][0] as Record<string, unknown>;

      expect(firstArgs.excludedTools).toEqual(["url"]);
      expect(secondArgs.excludedTools).toEqual(["shell"]);
    });

    it("cached session does NOT pick up config changes (by design)", async () => {
      const config1 = configWith({});
      await getOrCreateSession("conv-cached", config1, "test-key-123");

      const config2 = configWith({ toolShell: false });
      await getOrCreateSession("conv-cached", config2, "test-key-123");

      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });
  });
});
