/**
 * Global test setup — provides default mocks for external process dependencies.
 *
 * Individual test files can override these with their own vi.mock() calls,
 * which take precedence over this setup file.
 */
import { vi } from "vitest";

// Default child_process mock: process-spawning functions return plausible
// values so copilotService resolution chain succeeds by default.
// This prevents probeCliCompatibility and other real process calls from
// running during tests that only care about SDK/extension behavior.
vi.mock("child_process", () => {
  const execFileMock = vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      callback?: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      // Default: probe succeeds (no error)
      if (callback) {
        callback(null, "", "");
      }
      return { kill: vi.fn(), pid: 12345 };
    },
  );
  const spawnMock = vi.fn(() => ({
    pid: 12345,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    on: vi.fn().mockReturnThis(),
    stderr: {
      on: vi.fn().mockReturnThis(),
    },
  }));

  return {
    // resolveCopilotCliFromPath() calls execSync("which copilot" / "where copilot")
    execSync: vi.fn().mockReturnValue("/usr/local/bin/copilot\n"),
    // validateCopilotCli() calls execFileSync(path, ["--version"])
    execFileSync: vi.fn().mockReturnValue("0.1.26"),
    // cliInstaller uses execFile for npm/tar flows
    execFile: execFileMock,
    // probeCliCompatibility() calls spawn(path, ["--headless", ...])
    spawn: spawnMock,
  };
});
