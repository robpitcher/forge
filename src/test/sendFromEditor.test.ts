import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { activate } from "../extension.js";
import { stopClient } from "../copilotService.js";
import {
  createMockSession,
  createMockClient,
  setMockClient,
} from "./__mocks__/copilot-sdk.js";

vi.mock("@github/copilot-sdk", () => import("./__mocks__/copilot-sdk.js"));
vi.mock("../auth/authStatusProvider.js", () => ({
  checkAuthStatus: vi
    .fn()
    .mockResolvedValue({ state: "authenticated", method: "apiKey" }),
}));

describe("sendFromEditor (forge.explain / forge.fix / forge.tests)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let commandCallbacks: Record<string, (...args: any[]) => any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let capturedProvider: any;

  function setupValidConfig() {
    const settings: Record<string, string> = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "test-key-123",
      authMethod: "apiKey",
      wireApi: "completions",
      cliPath: "",
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(
        (key: string, defaultValue: unknown) => settings[key] ?? defaultValue,
      ),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  }

  function createMockEditor(options: {
    text?: string;
    languageId?: string;
    uriPath?: string;
    startLine?: number;
    startChar?: number;
    endLine?: number;
    endChar?: number;
  } = {}) {
    const text = options.text ?? "const x = 1;";
    const languageId = options.languageId ?? "typescript";
    const uriPath = options.uriPath ?? "file:///test.ts";
    return {
      document: {
        getText: vi.fn().mockReturnValue(text),
        languageId,
        uri: { toString: () => uriPath },
      },
      selection: {
        start: {
          line: options.startLine ?? 0,
          character: options.startChar ?? 0,
        },
        end: {
          line: options.endLine ?? 0,
          character: options.endChar ?? text.length,
        },
      },
    };
  }

  beforeEach(() => {
    commandCallbacks = {};

    const mockSession = createMockSession();
    const mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
    setupValidConfig();

    // Capture command registrations
    vi.mocked(vscode.commands.registerCommand).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (command: string, callback: (...args: any[]) => any) => {
        commandCallbacks[command] = callback;
        return { dispose: vi.fn() };
      },
    );

    const stateStore = new Map<string, unknown>();
    const mockExtContext = {
      subscriptions: [] as { dispose: () => void }[],
      extensionUri: { toString: () => "mock-ext-uri" },
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

    // Capture the ChatViewProvider instance
    const calls = vi.mocked(
      vscode.window.registerWebviewViewProvider,
    ).mock.calls;
    capturedProvider = calls[calls.length - 1][1];
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.commands.registerCommand).mockClear();
    vi.mocked(vscode.commands.executeCommand).mockClear();
    vi.mocked(vscode.window.registerWebviewViewProvider).mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.window as any).activeTextEditor = undefined;
  });

  it("registers forge.explain, forge.fix, and forge.tests commands", () => {
    expect(commandCallbacks["forge.explain"]).toBeDefined();
    expect(commandCallbacks["forge.fix"]).toBeDefined();
    expect(commandCallbacks["forge.tests"]).toBeDefined();
  });

  describe("no active editor", () => {
    it("returns early without focusing the chat view", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = undefined;
      vi.mocked(vscode.commands.executeCommand).mockClear();

      await commandCallbacks["forge.explain"]();

      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "forge.chatView.focus",
      );
    });
  });

  describe("empty selection", () => {
    it("returns early when getText returns empty string", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = createMockEditor({ text: "" });
      vi.mocked(vscode.commands.executeCommand).mockClear();

      await commandCallbacks["forge.explain"]();

      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "forge.chatView.focus",
      );
    });
  });

  describe("active editor with selection", () => {
    it("forge.explain sends correct instruction and context", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = createMockEditor({
        text: "const x = 1;",
        languageId: "typescript",
        uriPath: "file:///src/test.ts",
        startLine: 5,
        endLine: 5,
        endChar: 12,
      });
      const spy = vi.spyOn(capturedProvider, "sendMessageWithContext");

      await commandCallbacks["forge.explain"]();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "forge.chatView.focus",
      );
      expect(spy).toHaveBeenCalledWith(
        "Explain the following code in detail.",
        [
          expect.objectContaining({
            type: "selection",
            content: "const x = 1;",
            languageId: "typescript",
          }),
        ],
      );
    });

    it("forge.fix sends fix instruction", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = createMockEditor({
        text: "buggy code",
      });
      const spy = vi.spyOn(capturedProvider, "sendMessageWithContext");

      await commandCallbacks["forge.fix"]();

      expect(spy).toHaveBeenCalledWith(
        "Find and fix any bugs or issues in the following code.",
        [expect.objectContaining({ content: "buggy code" })],
      );
    });

    it("forge.tests sends tests instruction", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = createMockEditor({
        text: "function add(a, b) { return a + b; }",
      });
      const spy = vi.spyOn(capturedProvider, "sendMessageWithContext");

      await commandCallbacks["forge.tests"]();

      expect(spy).toHaveBeenCalledWith(
        "Write unit tests for the following code.",
        [
          expect.objectContaining({
            content: "function add(a, b) { return a + b; }",
          }),
        ],
      );
    });

    it("context includes correct startLine and endLine (1-based)", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = createMockEditor({
        text: "some code",
        startLine: 10,
        endLine: 15,
        endChar: 5,
      });
      const spy = vi.spyOn(capturedProvider, "sendMessageWithContext");

      await commandCallbacks["forge.explain"]();

      expect(spy).toHaveBeenCalledWith(expect.any(String), [
        expect.objectContaining({
          startLine: 11, // 0-based line 10 → 1-based 11
          endLine: 16, // 0-based line 15 → 1-based 16
        }),
      ]);
    });

    it("adjusts endLine when selection ends at character 0 of a later line", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = createMockEditor({
        text: "line of code",
        startLine: 2,
        endLine: 5,
        endChar: 0, // cursor at start of line 5
      });
      const spy = vi.spyOn(capturedProvider, "sendMessageWithContext");

      await commandCallbacks["forge.explain"]();

      expect(spy).toHaveBeenCalledWith(expect.any(String), [
        expect.objectContaining({
          startLine: 3, // line 2 + 1
          endLine: 5, // adjusted: line 5 (not 6) because endChar === 0
        }),
      ]);
    });

    it("passes filePath from workspace.asRelativePath", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = createMockEditor({
        text: "code",
        uriPath: "file:///workspace/src/utils.ts",
      });
      const spy = vi.spyOn(capturedProvider, "sendMessageWithContext");

      await commandCallbacks["forge.explain"]();

      expect(vscode.workspace.asRelativePath).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(expect.any(String), [
        expect.objectContaining({ filePath: expect.any(String) }),
      ]);
    });

    it("focuses the Forge chat view before sending", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = createMockEditor();

      await commandCallbacks["forge.explain"]();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "forge.chatView.focus",
      );
    });
  });
});
