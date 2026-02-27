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
