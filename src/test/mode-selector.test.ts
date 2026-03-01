/**
 * Mode Selector Tests — Issue #108
 *
 * Tests the Chat / Agent / Plan mode selector.
 *
 * Expected behavior:
 *   - Chat mode excludes shell, write, url, mcp tools
 *   - Agent mode uses per-setting tool config (existing behavior)
 *   - Plan mode adds system message prefix
 *   - buildToolConfig is mode-aware
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import type { ExtensionConfig } from "../configuration.js";
import {
  getOrCreateSession,
  stopClient,
  buildToolConfig,
} from "../copilotService.js";
import type { ChatMode } from "../copilotService.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/",
  apiKey: "test-key-123",
  authMethod: "apiKey",
  model: "gpt-4.1",
  models: ["gpt-4.1"],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Mode selector (#108)", () => {
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
  // 1. buildToolConfig unit tests
  // =========================================================================
  describe("buildToolConfig", () => {
    it("Chat mode excludes shell, write, url, mcp", () => {
      const config = configWith({ toolShell: true, toolWrite: true, toolUrl: true, toolMcp: true });
      const result = buildToolConfig(config, "chat");

      expect(result.excludedTools).toBeDefined();
      const excluded = result.excludedTools as string[];
      expect(excluded).toContain("shell");
      expect(excluded).toContain("write");
      expect(excluded).toContain("url");
      expect(excluded).toContain("mcp");
    });

    it("Chat mode does NOT exclude read by default", () => {
      const config = configWith({});
      const result = buildToolConfig(config, "chat");

      const excluded = result.excludedTools as string[];
      expect(excluded).not.toContain("read");
    });

    it("Chat mode excludes read when toolRead is false", () => {
      const config = configWith({ toolRead: false });
      const result = buildToolConfig(config, "chat");

      const excluded = result.excludedTools as string[];
      expect(excluded).toContain("read");
    });

    it("Agent mode uses per-setting tool config", () => {
      const config = configWith({ toolShell: false, toolUrl: false });
      const result = buildToolConfig(config, "agent");

      const excluded = result.excludedTools as string[];
      expect(excluded).toContain("shell");
      expect(excluded).toContain("url");
      expect(excluded).not.toContain("write");
      expect(excluded).not.toContain("mcp");
    });

    it("Agent mode with all tools enabled returns empty config", () => {
      const config = configWith({ toolUrl: true });
      const result = buildToolConfig(config, "agent");

      expect(result.excludedTools).toBeUndefined();
    });

    it("Plan mode uses per-setting tool config (same as agent)", () => {
      const config = configWith({ toolUrl: false });
      const result = buildToolConfig(config, "plan");

      const excluded = result.excludedTools as string[];
      expect(excluded).toEqual(["url"]);
    });

    it("defaults to agent mode when no mode specified", () => {
      const config = configWith({});
      const result = buildToolConfig(config);

      const excluded = result.excludedTools as string[];
      expect(excluded).toEqual(["url"]);
    });
  });

  // =========================================================================
  // 2. Session creation with modes
  // =========================================================================
  describe("session creation with modes", () => {
    it("Chat mode passes excludedTools to createSession", async () => {
      const config = configWith({ toolUrl: true, toolShell: true, toolWrite: true, toolMcp: true });
      await getOrCreateSession("conv-chat", config, "test-key", undefined, "chat");

      const args = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      const excluded = args.excludedTools as string[];
      expect(excluded).toContain("shell");
      expect(excluded).toContain("write");
      expect(excluded).toContain("url");
      expect(excluded).toContain("mcp");
    });

    it("Agent mode passes per-setting excludedTools", async () => {
      const config = configWith({});
      await getOrCreateSession("conv-agent", config, "test-key", undefined, "agent");

      const args = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(args.excludedTools).toEqual(["url"]);
    });

    it("Plan mode adds system message prefix", async () => {
      const config = configWith({});
      await getOrCreateSession("conv-plan", config, "test-key", undefined, "plan");

      const args = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      const systemMessage = args.systemMessage as { content: string };
      expect(systemMessage).toBeDefined();
      expect(systemMessage.content).toContain("step-by-step plan");
    });

    it("Plan mode merges system message with user-configured systemMessage", async () => {
      const config = configWith({ systemMessage: "You are a helpful assistant." });
      await getOrCreateSession("conv-plan-merged", config, "test-key", undefined, "plan");

      const args = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      const systemMessage = args.systemMessage as { content: string };
      expect(systemMessage.content).toContain("step-by-step plan");
      expect(systemMessage.content).toContain("You are a helpful assistant.");
    });

    it("Chat mode does not add plan system message", async () => {
      const config = configWith({});
      await getOrCreateSession("conv-chat-nosys", config, "test-key", undefined, "chat");

      const args = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(args.systemMessage).toBeUndefined();
    });

    it("Agent mode without systemMessage does not add one", async () => {
      const config = configWith({});
      await getOrCreateSession("conv-agent-nosys", config, "test-key", undefined, "agent");

      const args = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(args.systemMessage).toBeUndefined();
    });
  });
});
