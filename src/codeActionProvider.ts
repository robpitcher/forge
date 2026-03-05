import * as vscode from "vscode";

/**
 * Provides "Explain with Forge", "Fix with Forge", and "Write Tests with Forge"
 * code actions in the lightbulb / context menu for non-empty selections.
 */
export class ForgeCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    _document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] | undefined {
    if (range.isEmpty) {
      return undefined;
    }

    const explain = new vscode.CodeAction(
      "Explain with Forge",
      vscode.CodeActionKind.QuickFix,
    );
    explain.command = {
      command: "forge.explain",
      title: "Explain with Forge",
    };

    const fix = new vscode.CodeAction(
      "Fix with Forge",
      vscode.CodeActionKind.QuickFix,
    );
    fix.command = {
      command: "forge.fix",
      title: "Fix with Forge",
    };

    const tests = new vscode.CodeAction(
      "Write Tests with Forge",
      vscode.CodeActionKind.QuickFix,
    );
    tests.command = {
      command: "forge.tests",
      title: "Write Tests with Forge",
    };

    return [explain, fix, tests];
  }
}
