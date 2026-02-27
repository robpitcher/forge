import { vi } from "vitest";

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
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
};

export const commands = {
  executeCommand: vi.fn().mockResolvedValue(undefined),
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
