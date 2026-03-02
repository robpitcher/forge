import { describe, it, expect } from "vitest";
import * as vscode from "vscode";
import { ForgeCodeActionProvider } from "../codeActionProvider.js";

const Range = vscode.Range as any;

function makeRange(start: number, end: number): vscode.Range {
  return new Range(start, end);
}

describe("ForgeCodeActionProvider", () => {
  const provider = new ForgeCodeActionProvider();

  it("providedCodeActionKinds contains QuickFix", () => {
    expect(ForgeCodeActionProvider.providedCodeActionKinds).toContain(
      vscode.CodeActionKind.QuickFix,
    );
  });

  it("returns undefined for an empty range", () => {
    const emptyRange = makeRange(1, 1);
    const result = provider.provideCodeActions(
      {} as vscode.TextDocument,
      emptyRange,
    );
    expect(result).toBeUndefined();
  });

  it("returns exactly 3 code actions for a non-empty range", () => {
    const range = makeRange(0, 5);
    const result = provider.provideCodeActions(
      {} as vscode.TextDocument,
      range,
    );
    expect(result).toHaveLength(3);
  });

  it("actions have correct titles", () => {
    const range = makeRange(0, 5);
    const result = provider.provideCodeActions(
      {} as vscode.TextDocument,
      range,
    )!;
    expect(result[0].title).toBe("Explain with Forge");
    expect(result[1].title).toBe("Fix with Forge");
    expect(result[2].title).toBe("Write Tests with Forge");
  });

  it("actions have correct commands", () => {
    const range = makeRange(0, 5);
    const result = provider.provideCodeActions(
      {} as vscode.TextDocument,
      range,
    )!;
    expect(result[0].command).toEqual({
      command: "forge.explain",
      title: "Explain with Forge",
    });
    expect(result[1].command).toEqual({
      command: "forge.fix",
      title: "Fix with Forge",
    });
    expect(result[2].command).toEqual({
      command: "forge.tests",
      title: "Write Tests with Forge",
    });
  });

  it("all actions use CodeActionKind.QuickFix", () => {
    const range = makeRange(0, 5);
    const result = provider.provideCodeActions(
      {} as vscode.TextDocument,
      range,
    )!;
    for (const action of result) {
      expect(action.kind).toBe(vscode.CodeActionKind.QuickFix);
    }
  });
});
