/**
 * Tests for az CLI detection in the forge.signIn command.
 *
 * The signIn command (authMethod: "entraId") checks whether `az` is on PATH
 * before opening a terminal.  If missing, it shows an actionable error message
 * with an install link.
 *
 * Because `isAzCliAvailable()` is module-private we test it indirectly through
 * the registered command handler.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { execFileSync } from "child_process";
import { platform } from "os";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import * as copilotService from "../copilotService.js";
import { activate } from "../extension.js";
import {
  createMockWebviewView,
  createMockResolveContext,
  createMockCancellationToken,
  type MockWebviewView,
} from "./webview-test-helpers.js";

vi.mock("@github/copilot-sdk", () => import("./__mocks__/copilot-sdk.js"));

vi.mock("os", () => ({
  platform: vi.fn().mockReturnValue("linux"),
}));

vi.mock("../auth/authStatusProvider.js", () => ({
  checkAuthStatus: vi
    .fn()
    .mockResolvedValue({ state: "authenticated", method: "entraId" }),
}));

vi.mock("../copilotService.js", async () => {
  const actual = await vi.importActual<typeof import("../copilotService.js")>(
    "../copilotService.js",
  );
  return {
    ...actual,
    discoverAndValidateCli: vi
      .fn()
      .mockResolvedValue({ valid: true, version: "0.1.0", path: "/usr/bin/copilot" }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the handler registered for the given VS Code command. */
function getCommandHandler(name: string): ((...args: unknown[]) => unknown) | undefined {
  const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
  const match = calls.find(([cmd]) => cmd === name);
  return match?.[1] as ((...args: unknown[]) => unknown) | undefined;
}

/** Set up VS Code workspace config to return the given settings. */
function setupConfig(overrides: Record<string, unknown> = {}) {
  const settings: Record<string, unknown> = {
    endpoint: "https://myresource.openai.azure.com/openai/v1/",
    apiKey: "test-key-123",
    authMethod: "entraId",
    wireApi: "completions",
    cliPath: "",
    models: ["gpt-4"],
    ...overrides,
  };
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn(
      (key: string, defaultValue: unknown) => settings[key] ?? defaultValue,
    ),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("az CLI detection (forge.signIn)", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;
  let _mockView: MockWebviewView;

  const mockExecFileSync = vi.mocked(execFileSync);
  const mockPlatform = vi.mocked(platform);

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
    setupConfig();

    // Default: Linux platform, az available
    mockPlatform.mockReturnValue("linux");
    mockExecFileSync.mockReturnValue("0.1.26");

    const stateStore = new Map<string, unknown>();
    const mockExtContext = {
      subscriptions: [] as { dispose: () => void }[],
      extensionUri: { toString: () => "mock-ext-uri" },
      globalStorageUri: { fsPath: "/tmp/mock-global-storage" },
      secrets: {
        get: vi.fn().mockImplementation((key: string) =>
          key === "forge.copilot.apiKey"
            ? Promise.resolve("test-key-123")
            : Promise.resolve(undefined),
        ),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      },
      workspaceState: {
        get: vi.fn(
          (key: string, defaultValue?: unknown) =>
            stateStore.get(key) ?? defaultValue,
        ),
        update: vi.fn((key: string, value: unknown) => {
          stateStore.set(key, value);
          return Promise.resolve();
        }),
        keys: vi.fn(() => [...stateStore.keys()]),
      },
    };

    activate(mockExtContext as unknown as import("vscode").ExtensionContext);

    // Resolve the webview provider so the extension is fully initialised.
    const providerCalls = vi.mocked(
      vscode.window.registerWebviewViewProvider,
    ).mock.calls;
    const provider = providerCalls[providerCalls.length - 1][1] as {
      resolveWebviewView: (v: unknown, c: unknown, t: unknown) => void;
    };
    _mockView = createMockWebviewView();
    provider.resolveWebviewView(
      _mockView,
      createMockResolveContext(),
      createMockCancellationToken(),
    );
  });

  afterEach(async () => {
    await copilotService.stopClient();
    vi.mocked(vscode.commands.registerCommand).mockClear();
    vi.mocked(vscode.window.registerWebviewViewProvider).mockClear();
    vi.mocked(vscode.window.createTerminal).mockClear();
    vi.mocked(vscode.window.showErrorMessage).mockClear();
    vi.mocked(vscode.env.openExternal).mockClear();
    mockExecFileSync.mockReset();
    mockExecFileSync.mockReturnValue("0.1.26");
  });

  // -----------------------------------------------------------------------
  // isAzCliAvailable — tested via the command handler
  // -----------------------------------------------------------------------

  describe("az CLI found (entraId)", () => {
    it("opens terminal and sends 'az login' when az is available", async () => {
      // execFileSync should NOT throw → az is available
      mockExecFileSync.mockReturnValue("/usr/bin/az\n");

      const handler = getCommandHandler("forge.signIn");
      expect(handler).toBeDefined();
      await handler!();

      expect(vscode.window.createTerminal).toHaveBeenCalledWith("Azure Sign In");
      const terminal = vi.mocked(vscode.window.createTerminal).mock.results[0]?.value;
      expect(terminal.sendText).toHaveBeenCalledWith("az login");
      expect(terminal.show).toHaveBeenCalled();
    });

    it("does NOT show error message when az is available", async () => {
      mockExecFileSync.mockReturnValue("/usr/bin/az\n");

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });
  });

  describe("az CLI NOT found (entraId)", () => {
    function makeAzNotFound() {
      // The first call from the signIn handler is `isAzCliAvailable()` which
      // calls execFileSync("which", ["az"], …).  Make it throw.
      const original = mockExecFileSync.getMockImplementation();
      mockExecFileSync.mockImplementation(((cmd: string, args?: readonly string[]) => {
        const command = String(cmd);
        const firstArg = args?.[0];
        if (
          (command === "which" || command === "where.exe") &&
          firstArg === "az"
        ) {
          const err = new Error("not found") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        }
        // Fall through for other execFileSync calls (e.g. copilot --version)
        if (original) {
          return original(cmd, args as string[], {} as any);
        }
        return "0.1.26";
      }) as typeof execFileSync);
    }

    it("shows error message with install URL", async () => {
      makeAzNotFound();

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Azure CLI is required"),
        "Install Azure CLI",
      );
    });

    it("error message includes the install URL text", async () => {
      makeAzNotFound();

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      const msg = vi.mocked(vscode.window.showErrorMessage).mock.calls[0]?.[0];
      expect(msg).toContain("https://aka.ms/azure-cli");
    });

    it("does NOT create a terminal when az is missing", async () => {
      makeAzNotFound();

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });

    it("opens install URL when user clicks 'Install Azure CLI'", async () => {
      makeAzNotFound();
      vi.mocked(vscode.window.showErrorMessage).mockResolvedValueOnce(
        "Install Azure CLI" as any,
      );

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
      const uri = vi.mocked(vscode.env.openExternal).mock.calls[0]?.[0];
      expect(uri.toString()).toBe("https://aka.ms/azure-cli");
    });

    it("does NOT open URL when user dismisses the error", async () => {
      makeAzNotFound();
      vi.mocked(vscode.window.showErrorMessage).mockResolvedValueOnce(
        undefined as any,
      );

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Cross-platform: which vs where.exe
  // -----------------------------------------------------------------------

  describe("cross-platform detection", () => {
    it("uses 'which' on Linux", async () => {
      mockPlatform.mockReturnValue("linux");
      mockExecFileSync.mockReturnValue("/usr/bin/az\n");

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "which",
        ["az"],
        { stdio: "ignore" },
      );
    });

    it("uses 'which' on macOS (darwin)", async () => {
      mockPlatform.mockReturnValue("darwin");
      mockExecFileSync.mockReturnValue("/usr/local/bin/az\n");

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "which",
        ["az"],
        { stdio: "ignore" },
      );
    });

    it("uses 'where.exe' on Windows (win32)", async () => {
      mockPlatform.mockReturnValue("win32");
      mockExecFileSync.mockReturnValue("C:\\Program Files\\Azure CLI\\az.cmd\n");

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "where.exe",
        ["az"],
        { stdio: "ignore" },
      );
    });
  });

  // -----------------------------------------------------------------------
  // apiKey auth — regression: must NOT check az CLI
  // -----------------------------------------------------------------------

  describe("apiKey auth method (regression)", () => {
    it("does NOT check for az CLI when authMethod is apiKey", async () => {
      setupConfig({ authMethod: "apiKey" });
      mockExecFileSync.mockClear();

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      // No calls to which/where.exe for az detection
      const azDetectionCalls = mockExecFileSync.mock.calls.filter(
        ([cmd, args]) =>
          (cmd === "which" || cmd === "where.exe") &&
          (args as string[])?.[0] === "az",
      );
      expect(azDetectionCalls).toHaveLength(0);
    });

    it("does NOT create a terminal for apiKey auth", async () => {
      setupConfig({ authMethod: "apiKey" });

      const handler = getCommandHandler("forge.signIn");
      await handler!();

      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });
  });
});
