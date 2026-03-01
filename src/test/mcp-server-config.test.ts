/**
 * MCP Server Configuration Tests — Issue #90
 *
 * Tests for MCP (Model Context Protocol) server configuration support.
 * Covers three layers:
 *   1. Configuration reading — getConfiguration() reads forge.copilot.mcpServers
 *   2. Validation — validateConfiguration() validates each server entry
 *   3. Service layer — buildMcpServersConfig() maps to SDK MCPLocalServerConfig
 *
 * Pattern follows tool-control-settings.test.ts for config → SDK passthrough.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import {
  getConfiguration,
  validateConfiguration,
  type ExtensionConfig,
} from "../configuration.js";
import {
  getOrCreateSession,
  resumeConversation,
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

describe("MCP server configuration (#90)", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;

  beforeEach(async () => {
    await stopClient();
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
  });

  afterEach(async () => {
    await stopClient();
  });

  // =========================================================================
  // 1. Configuration reading
  // =========================================================================
  describe("configuration reading", () => {
    it("getConfiguration returns undefined mcpServers when none configured", () => {
      setupVscodeConfig(); // no overrides — all defaults

      const config = getConfiguration();

      expect(config.mcpServers).toBeUndefined();
    });

    it("getConfiguration reads mcpServers setting with single server", () => {
      setupVscodeConfig({
        mcpServers: {
          "my-server": {
            command: "npx",
            args: ["-y", "@my/mcp-server"],
          },
        },
      });

      const config = getConfiguration();

      expect(config.mcpServers).toBeDefined();
      expect(Object.keys(config.mcpServers!)).toHaveLength(1);
      expect(config.mcpServers!["my-server"]).toEqual({
        command: "npx",
        args: ["-y", "@my/mcp-server"],
      });
    });

    it("getConfiguration reads mcpServers setting with multiple servers", () => {
      setupVscodeConfig({
        mcpServers: {
          "server-a": { command: "/usr/bin/server-a" },
          "server-b": {
            command: "python",
            args: ["-m", "mcp_server"],
            env: { DEBUG: "true" },
          },
        },
      });

      const config = getConfiguration();

      expect(config.mcpServers).toBeDefined();
      expect(Object.keys(config.mcpServers!)).toHaveLength(2);
      expect(config.mcpServers!["server-a"].command).toBe("/usr/bin/server-a");
      expect(config.mcpServers!["server-b"].command).toBe("python");
      expect(config.mcpServers!["server-b"].args).toEqual(["-m", "mcp_server"]);
      expect(config.mcpServers!["server-b"].env).toEqual({ DEBUG: "true" });
    });
  });

  // =========================================================================
  // 2. Validation
  // =========================================================================
  describe("validation", () => {
    it("validateConfiguration passes with valid MCP server config", () => {
      const config = configWith({
        mcpServers: {
          "good-server": {
            command: "node",
            args: ["server.js"],
            env: { PORT: "3000" },
          },
        },
      });

      const errors = validateConfiguration(config);

      const mcpErrors = errors.filter((e) => e.field.includes("mcpServers"));
      expect(mcpErrors).toHaveLength(0);
    });

    it("validateConfiguration passes with no MCP servers (undefined)", () => {
      const config = configWith({ mcpServers: undefined });

      const errors = validateConfiguration(config);

      const mcpErrors = errors.filter((e) => e.field.includes("mcpServers"));
      expect(mcpErrors).toHaveLength(0);
    });

    it("validateConfiguration passes with empty MCP servers object", () => {
      const config = configWith({ mcpServers: {} });

      const errors = validateConfiguration(config);

      const mcpErrors = errors.filter((e) => e.field.includes("mcpServers"));
      expect(mcpErrors).toHaveLength(0);
    });

    it("validateConfiguration errors when server missing command", () => {
      const config = configWith({
        mcpServers: {
          "bad-server": {} as { command: string },
        },
      });

      const errors = validateConfiguration(config);

      const mcpErrors = errors.filter((e) => e.field.includes("mcpServers"));
      expect(mcpErrors).toHaveLength(1);
      expect(mcpErrors[0].field).toContain("bad-server");
      expect(mcpErrors[0].message).toContain("command");
    });

    it("validateConfiguration errors when command is empty string", () => {
      const config = configWith({
        mcpServers: {
          "empty-cmd": { command: "" },
        },
      });

      const errors = validateConfiguration(config);

      const mcpErrors = errors.filter((e) => e.field.includes("mcpServers"));
      expect(mcpErrors).toHaveLength(1);
      expect(mcpErrors[0].field).toContain("empty-cmd");
      expect(mcpErrors[0].message).toContain("command");
    });

    it("validateConfiguration reports errors for multiple invalid servers", () => {
      const config = configWith({
        mcpServers: {
          "no-cmd-1": {} as { command: string },
          "no-cmd-2": { command: "" },
        },
      });

      const errors = validateConfiguration(config);

      const mcpErrors = errors.filter((e) => e.field.includes("mcpServers"));
      expect(mcpErrors).toHaveLength(2);
      expect(mcpErrors[0].field).toContain("no-cmd-1");
      expect(mcpErrors[1].field).toContain("no-cmd-2");
    });
  });

  // =========================================================================
  // 3. Service layer — SDK passthrough
  // =========================================================================
  describe("SDK passthrough", () => {
    it("getOrCreateSession passes mcpServers to SDK createSession", async () => {
      const config = configWith({
        mcpServers: {
          "test-mcp": {
            command: "node",
            args: ["server.js"],
          },
        },
      });

      await getOrCreateSession("conv-mcp-1", config, "test-key-123");

      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs.mcpServers).toBeDefined();
    });

    it("getOrCreateSession omits mcpServers when none configured", async () => {
      const config = configWith({ mcpServers: undefined });

      await getOrCreateSession("conv-mcp-none", config, "test-key-123");

      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      expect(sessionArgs.mcpServers).toBeUndefined();
    });

    it("getOrCreateSession maps McpServerConfig to SDK MCPLocalServerConfig format", async () => {
      const config = configWith({
        mcpServers: {
          "full-server": {
            command: "/usr/bin/mcp-tool",
            args: ["--verbose"],
            env: { NODE_ENV: "production" },
          },
          "minimal-server": {
            command: "npx",
          },
        },
      });

      await getOrCreateSession("conv-mcp-map", config, "test-key-123");

      const sessionArgs = mockClient.createSession.mock.calls[0][0] as Record<string, unknown>;
      const mcpServers = sessionArgs.mcpServers as Record<string, Record<string, unknown>>;

      // Full server: all fields mapped
      expect(mcpServers["full-server"]).toEqual({
        type: "local",
        command: "/usr/bin/mcp-tool",
        args: ["--verbose"],
        tools: ["*"],
        env: { NODE_ENV: "production" },
      });

      // Minimal server: args defaults to [], env omitted when not configured
      expect(mcpServers["minimal-server"]).toEqual({
        type: "local",
        command: "npx",
        args: [],
        tools: ["*"],
      });
      expect(mcpServers["minimal-server"]).not.toHaveProperty("env");
    });

    it("resumeConversation passes mcpServers to SDK resumeSession", async () => {
      const config = configWith({
        mcpServers: {
          "resume-server": {
            command: "python",
            args: ["-m", "mcp_server"],
          },
        },
      });

      await resumeConversation("conv-resume-mcp", config, "test-key-123");

      const resumeArgs = mockClient.resumeSession.mock.calls[0];
      expect(resumeArgs[0]).toBe("conv-resume-mcp");

      const resumeConfig = resumeArgs[1] as Record<string, unknown>;
      const mcpServers = resumeConfig.mcpServers as Record<string, Record<string, unknown>>;

      expect(mcpServers).toBeDefined();
      expect(mcpServers["resume-server"]).toEqual({
        type: "local",
        command: "python",
        args: ["-m", "mcp_server"],
        tools: ["*"],
      });
    });
  });
});
