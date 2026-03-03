import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;
type MockEventHandler = (...args: unknown[]) => void;
type HttpsResponseCallback = (response: unknown) => void;

// Hoisted mocks
const mockExecFile = vi.fn();
const mockSpawn = vi.fn();
const mockExistsSync = vi.fn();
const mockStatSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockCreateWriteStream = vi.fn();
const mockHttpsGet = vi.fn();

vi.mock("child_process", () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
  execSync: vi.fn().mockReturnValue("/usr/local/bin/copilot\n"),
  execFileSync: vi.fn().mockReturnValue("0.1.26"),
}));

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

vi.mock("fs", () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  createWriteStream: mockCreateWriteStream,
  createReadStream: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock("https", () => ({
  get: mockHttpsGet,
}));

vi.mock("stream/promises", () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("zlib", () => ({
  createGunzip: vi.fn(),
}));

// Dynamic imports to pick up mocks
let installCopilotCli: typeof import("../cliInstaller.js")["installCopilotCli"];
let getManagedCliPath: typeof import("../cliInstaller.js")["getManagedCliPath"];
let isManagedCliInstalled: typeof import("../cliInstaller.js")["isManagedCliInstalled"];

function createMockSpawnedProcess() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    kill: ReturnType<typeof vi.fn>;
    exitCode: null;
    signalCode: null;
    stderr: EventEmitter;
    stdout: EventEmitter;
  };
  child.pid = 12345;
  child.kill = vi.fn();
  child.exitCode = null;
  child.signalCode = null;
  child.stderr = new EventEmitter();
  child.stdout = new EventEmitter();
  return child;
}

describe("cliInstaller", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset implementations (clearAllMocks only clears call history, not implementations)
    mockMkdirSync.mockReset();
    mockExistsSync.mockReset();
    mockStatSync.mockReset();
    mockWriteFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockExecFile.mockReset();
    mockSpawn.mockReset();
    mockCreateWriteStream.mockReset();
    mockHttpsGet.mockReset();
    mockSpawn.mockImplementation(() => createMockSpawnedProcess());

    const module = await import("../cliInstaller.js");
    installCopilotCli = module.installCopilotCli;
    getManagedCliPath = module.getManagedCliPath;
    isManagedCliInstalled = module.isManagedCliInstalled;
  });

  describe("isManagedCliInstalled", () => {
    it("returns true when CLI exists at expected location", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true });

      const result = await isManagedCliInstalled("/test/storage");
      expect(result).toBe(true);
    });

    it("returns false when directory doesn't exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await isManagedCliInstalled("/test/storage");
      expect(result).toBe(false);
    });

    it("returns false when file is not accessible", async () => {
      mockExistsSync.mockImplementation(() => { throw new Error("EACCES"); });

      const result = await isManagedCliInstalled("/test/storage");
      expect(result).toBe(false);
    });
  });

  describe("getManagedCliPath", () => {
    it("returns the CLI path when installed", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true });

      const result = await getManagedCliPath("/test/storage");
      expect(result).toBeDefined();
      expect(result).toContain("/test/storage");
      expect(result).toContain("npm-loader.js");
    });

    it("returns undefined when not installed", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await getManagedCliPath("/test/storage");
      expect(result).toBeUndefined();
    });

    it("returns undefined when path is not accessible", async () => {
      mockExistsSync.mockImplementation(() => { throw new Error("EACCES"); });

      const result = await getManagedCliPath("/test/storage");
      expect(result).toBeUndefined();
    });
  });

  describe("installCopilotCli - happy paths", () => {
    it("succeeds via npm when npm is available", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));

      mockExecFile.mockImplementation(
        (cmd: string, _args: string[], _opts: Record<string, unknown>, callback?: ExecFileCallback) => {
          if (cmd === "npm" && callback) {
            callback(null, "installed", "");
          }
          return { kill: vi.fn(), pid: 12345 };
        },
      );
      mockExistsSync.mockReturnValue(true);

      const result = await installCopilotCli({
        globalStoragePath: "/test/storage",
        targetVersion: "0.1.26",
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe("npm");
      expect(result.cliPath).toContain("npm-loader.js");
    });

    it("falls back to HTTP when npm not found", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));

      mockExecFile.mockImplementation(
        (cmd: string, _args: string[], _opts: Record<string, unknown>, callback?: ExecFileCallback) => {
          if (cmd === "npm" && callback) {
            callback(new Error("ENOENT: npm not found"), "", "");
          } else if (cmd === "tar" && callback) {
            callback(null, "", "");
          }
          return { kill: vi.fn(), pid: 12345 };
        },
      );

      // Mock HTTP download
      const mockFileStream = {
        close: vi.fn(),
        on: vi.fn((event: string, handler: MockEventHandler) => {
          if (event === "finish") handler();
          return mockFileStream;
        }),
      };
      mockCreateWriteStream.mockReturnValue(mockFileStream);

      const mockResponse = {
        statusCode: 200,
        headers: {},
        pipe: vi.fn().mockReturnValue(mockFileStream),
        on: vi.fn().mockReturnThis(),
      };
      mockHttpsGet.mockImplementation((_url: string, callback: HttpsResponseCallback) => {
        callback(mockResponse);
        return { on: vi.fn().mockReturnThis() };
      });

      mockExistsSync.mockReturnValue(true);

      const result = await installCopilotCli({
        globalStoragePath: "/test/storage",
        targetVersion: "0.1.26",
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe("http-tarball");
    });

    it("creates globalStoragePath if it doesn't exist", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));
      mockExecFile.mockImplementation(
        (cmd: string, _args: string[], _opts: Record<string, unknown>, callback?: ExecFileCallback) => {
          if (cmd === "npm" && callback) callback(null, "installed", "");
          return { kill: vi.fn(), pid: 12345 };
        },
      );
      mockExistsSync.mockReturnValue(true);

      await installCopilotCli({
        globalStoragePath: "/test/storage",
        targetVersion: "0.1.26",
      });

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("/test/storage"),
        { recursive: true },
      );
    });

    it("defaults version to SDK version when not specified", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));

      let capturedArgs: string[] = [];
      mockExecFile.mockImplementation(
        (cmd: string, args: string[], _opts: Record<string, unknown>, callback?: ExecFileCallback) => {
          if (cmd === "npm") {
            capturedArgs = args;
            if (callback) callback(null, "installed", "");
          }
          return { kill: vi.fn(), pid: 12345 };
        },
      );
      mockExistsSync.mockReturnValue(true);

      await installCopilotCli({ globalStoragePath: "/test/storage" });

      expect(capturedArgs).toContain("@github/copilot@0.1.26");
    });
  });

  describe("installCopilotCli - error paths", () => {
    it("fails when both npm and HTTP fail", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));

      mockExecFile.mockImplementation(
        (cmd: string, _args: string[], _opts: Record<string, unknown>, callback?: ExecFileCallback) => {
          if (cmd === "npm" && callback) {
            callback(new Error("ENOENT: npm not found"), "", "");
          }
          return { kill: vi.fn(), pid: 12345 };
        },
      );

      mockHttpsGet.mockImplementation((_url: string, _callback: HttpsResponseCallback) => {
        return {
          on: vi.fn((_event: string, handler: MockEventHandler) => {
            handler(new Error("Network error"));
            return { on: vi.fn() };
          }),
        };
      });

      const result = await installCopilotCli({
        globalStoragePath: "/test/storage",
        targetVersion: "0.1.26",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("handles npm timeout", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));

      mockExecFile.mockImplementation(
        (cmd: string, _args: string[], _opts: Record<string, unknown>, callback?: ExecFileCallback) => {
          if (cmd === "npm" && callback) {
            callback(new Error("Command timed out"), "", "");
          }
          return { kill: vi.fn(), pid: 12345 };
        },
      );

      const result = await installCopilotCli({
        globalStoragePath: "/test/storage",
        targetVersion: "0.1.26",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("npm install failed");
    });

    it("handles write permission errors on globalStoragePath", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));

      mockMkdirSync.mockImplementation(() => {
        throw new Error("EACCES: permission denied");
      });

      const result = await installCopilotCli({
        globalStoragePath: "/test/storage",
        targetVersion: "0.1.26",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("install directory");
    });
  });

  describe("resolution chain (copilotService)", () => {
    // Note: cliPath priority and managed copy preference are tested in copilotService.test.ts

    it("throws CopilotCliNeedsInstallError when nothing found", async () => {
      vi.resetModules();

      const { getOrCreateClient, stopClient, CopilotCliNeedsInstallError } =
        await import("../copilotService.js");
      const { setMockClient, createMockSession, createMockClient } =
        await import("./__mocks__/copilot-sdk.js");
      await stopClient();

      const session = createMockSession();
      const client = createMockClient(session);
      setMockClient(client);

      mockExistsSync.mockReturnValue(false);
      const { execSync } = await import("child_process");
      vi.mocked(execSync).mockReturnValue("");

      await expect(
        getOrCreateClient(
          {
            endpoint: "https://test.openai.azure.com/",
            apiKey: "test-key",
            authMethod: "apiKey" as const,
            models: ["gpt-4.1"],
            wireApi: "completions" as const,
            cliPath: "",
            toolShell: true,
            toolRead: true,
            toolWrite: true,
            toolUrl: false,
            toolMcp: true,
          },
          "/test/storage",
        ),
      ).rejects.toThrow(CopilotCliNeedsInstallError);
    });
  });

  describe("startup validation", () => {
    it("rejects incompatible binary with unknown option --headless", async () => {
      vi.resetModules();

      const { probeCliCompatibility } = await import("../copilotService.js");

      mockSpawn.mockImplementation(() => {
        const child = createMockSpawnedProcess();
        process.nextTick(() => {
          child.stderr.emit("data", "unknown option '--headless'");
          child.emit("exit", 1, null);
        });
        return child;
      });

      const result = await probeCliCompatibility("/test/copilot");
      expect(result.compatible).toBe(false);
      expect(result.error).toContain("required flags");
    });

    it("rejects binaries that exit immediately", async () => {
      vi.resetModules();

      const { probeCliCompatibility } = await import("../copilotService.js");

      mockSpawn.mockImplementation(() => {
        const child = createMockSpawnedProcess();
        process.nextTick(() => {
          child.emit("exit", 0, null);
        });
        return child;
      });

      const result = await probeCliCompatibility("/test/copilot");
      expect(result.compatible).toBe(false);
      expect(result.error).toContain("exited before startup probe completed");
    });

    it("accepts compatible binary", async () => {
      vi.resetModules();

      const { probeCliCompatibility } = await import("../copilotService.js");

      mockSpawn.mockImplementation(() => createMockSpawnedProcess());

      const result = await probeCliCompatibility("/test/copilot");
      expect(result.compatible).toBe(true);
    });
  });

  describe("error messages", () => {
    it("tells user what to do when npm and HTTP both fail", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));

      mockExecFile.mockImplementation(
        (cmd: string, _args: string[], _opts: Record<string, unknown>, callback?: ExecFileCallback) => {
          if (cmd === "npm" && callback) {
            callback(new Error("ENOENT: npm not found"), "", "");
          }
          return { kill: vi.fn(), pid: 12345 };
        },
      );

      mockHttpsGet.mockImplementation((_url: string, _callback: HttpsResponseCallback) => {
        return {
          on: vi.fn((_event: string, handler: MockEventHandler) => {
            handler(new Error("Network error"));
            return { on: vi.fn() };
          }),
        };
      });

      const result = await installCopilotCli({
        globalStoragePath: "/test/storage",
        targetVersion: "0.1.26",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("includes specific reason for HTTP failure", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        dependencies: { "@github/copilot-sdk": "0.1.26" },
      }));

      mockExecFile.mockImplementation(
        (cmd: string, _args: string[], _opts: Record<string, unknown>, callback?: ExecFileCallback) => {
          if (cmd === "npm" && callback) {
            callback(new Error("ENOENT: npm not found"), "", "");
          } else if (cmd === "tar" && callback) {
            callback(null, "", "");
          }
          return { kill: vi.fn(), pid: 12345 };
        },
      );

      const mockResponse = {
        statusCode: 404,
        statusMessage: "Not Found",
        headers: {},
        pipe: vi.fn(),
        on: vi.fn(),
      };
      mockHttpsGet.mockImplementation((_url: string, callback: HttpsResponseCallback) => {
        callback(mockResponse);
        return { on: vi.fn().mockReturnThis() };
      });

      const result = await installCopilotCli({
        globalStoragePath: "/test/storage",
        targetVersion: "0.1.26",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });
  });
});
