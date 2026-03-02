import { vi } from "vitest";

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
    update: vi.fn().mockResolvedValue(undefined),
  }),
  onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  asRelativePath: vi.fn((pathOrUri: unknown) => {
    const str = typeof pathOrUri === "string" ? pathOrUri : String(pathOrUri);
    return str.replace(/^file:\/\/\//, "");
  }),
};

export const chat = {
  createChatParticipant: vi.fn().mockReturnValue({
    iconPath: null,
    dispose: vi.fn(),
  }),
};

export const window = {
  registerWebviewViewProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  showQuickPick: vi.fn().mockResolvedValue(undefined),
  showInputBox: vi.fn().mockResolvedValue(undefined),
  showInformationMessage: vi.fn().mockResolvedValue(undefined),
  createOutputChannel: vi.fn().mockReturnValue({
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  }),
  createStatusBarItem: vi.fn().mockReturnValue({
    text: "",
    tooltip: "",
    command: "",
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  }),
  onDidChangeWindowState: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  createTerminal: vi.fn().mockReturnValue({
    sendText: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  }),
};

export const commands = {
  executeCommand: vi.fn().mockResolvedValue(undefined),
  registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};

export class ThemeIcon {
  constructor(public id: string) {}
}

export class CancellationTokenSource {
  token = {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  };
  cancel = vi.fn();
  dispose = vi.fn();
}

export class Uri {
  static joinPath(..._args: unknown[]): Uri {
    return new Uri();
  }
  toString(): string {
    return "mock-uri";
  }
}

export class Disposable {
  constructor(private readonly callOnDispose: () => void) {}
  dispose(): void {
    this.callOnDispose();
  }
}

export const CodeActionKind = {
  QuickFix: { value: "quickfix" },
};

export class CodeAction {
  command?: { command: string; title: string };
  constructor(
    public title: string,
    public kind?: typeof CodeActionKind.QuickFix,
  ) {}
}

export class Range {
  constructor(
    public start: any = {},
    public end: any = {},
  ) {}
  get isEmpty(): boolean {
    return this.start === this.end;
  }
}

export class Selection extends Range {}

export const languages = {
  registerCodeActionsProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};
