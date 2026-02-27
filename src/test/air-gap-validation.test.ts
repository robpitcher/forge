import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
  getConfiguration,
  type ExtensionConfig,
} from "../configuration.js";
import {
  getOrCreateClient,
  getOrCreateSession,
  stopClient,
} from "../copilotService.js";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  constructorSpy,
} from "./__mocks__/copilot-sdk.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

const validAirGapConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/openai/v1/",
  apiKey: "azure-key-123",
  model: "gpt-4.1",
  wireApi: "completions",
  cliPath: "",
};

describe("Air-gap validation (SC2, SC3)", () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReset();
  });

  afterEach(async () => {
    await stopClient();
  });

  describe("No GitHub API endpoint references in source code", () => {
    it("configuration.ts does not reference GitHub API endpoints", async () => {
      const configSource = await import("../configuration.js");
      const sourceText = configSource.getConfiguration.toString() +
        configSource.validateConfiguration.toString();

      expect(sourceText).not.toMatch(/github\.com/i);
      expect(sourceText).not.toMatch(/api\.github/i);
    });

    it("copilotService.ts does not reference GitHub API endpoints", async () => {
      const serviceSource = await import("../copilotService.js");
      const sourceText = serviceSource.getOrCreateClient.toString() +
        serviceSource.getOrCreateSession.toString() +
        serviceSource.stopClient.toString();

      expect(sourceText).not.toMatch(/github\.com/i);
      expect(sourceText).not.toMatch(/api\.github/i);
    });

    it("extension.ts does not reference GitHub API endpoints", async () => {
      const extensionSource = await import("../extension.js");
      const sourceText = extensionSource.activate.toString() +
        extensionSource.deactivate.toString();

      expect(sourceText).not.toMatch(/github\.com/i);
      expect(sourceText).not.toMatch(/api\.github/i);
    });
  });

  describe("No GITHUB_TOKEN dependency", () => {
    it("configuration does not read GITHUB_TOKEN", () => {
      const mockGet = vi.fn(
        (key: string, defaultValue: unknown) => defaultValue
      );
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: mockGet,
      } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

      getConfiguration();

      // Verify it only reads from enclave.copilot settings
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith(
        "enclave.copilot"
      );
      expect(mockGet).not.toHaveBeenCalledWith(
        expect.stringMatching(/github/i)
      );
    });

    it("configuration does not check environment for GITHUB_TOKEN", async () => {
      const configSource = await import("../configuration.js");
      const sourceText = configSource.getConfiguration.toString() +
        configSource.validateConfiguration.toString();

      expect(sourceText).not.toMatch(/GITHUB_TOKEN/);
      expect(sourceText).not.toMatch(/process\.env/);
    });

    it("copilotService does not check environment for GITHUB_TOKEN", async () => {
      const serviceSource = await import("../copilotService.js");
      const sourceText = serviceSource.getOrCreateClient.toString() +
        serviceSource.getOrCreateSession.toString();

      expect(sourceText).not.toMatch(/GITHUB_TOKEN/);
    });
  });

  describe("Azure AI Foundry-only endpoint configuration", () => {
    it("session uses only configured Azure endpoint", async () => {
      const mockSession = createMockSession();
      const mockClient = createMockClient(mockSession);
      setMockClient(mockClient);

      await getOrCreateSession("conv-1", validAirGapConfig);

      expect(mockClient.createSession).toHaveBeenCalledWith({
        model: "gpt-4.1",
        provider: {
          type: "openai",
          baseUrl: validAirGapConfig.endpoint,
          apiKey: validAirGapConfig.apiKey,
          wireApi: "completions",
        },
        streaming: true,
        availableTools: [],
      });
    });

    it("session config does not include GitHub API endpoints", async () => {
      const mockSession = createMockSession();
      const mockClient = createMockClient(mockSession);
      setMockClient(mockClient);

      await getOrCreateSession("conv-1", validAirGapConfig);

      const callArg = mockClient.createSession.mock.calls[0][0];
      const configString = JSON.stringify(callArg);

      expect(configString).not.toMatch(/github\.com/i);
      expect(configString).not.toMatch(/api\.github/i);
    });

    it("uses Azure endpoint even with custom model names", async () => {
      const mockSession = createMockSession();
      const mockClient = createMockClient(mockSession);
      setMockClient(mockClient);

      const customConfig = {
        ...validAirGapConfig,
        model: "gpt-4o-mini-custom-deployment",
      };

      await getOrCreateSession("conv-2", customConfig);

      const callArg = mockClient.createSession.mock.calls[0][0];
      expect(callArg.provider.baseUrl).toBe(customConfig.endpoint);
      expect(callArg.model).toBe("gpt-4o-mini-custom-deployment");
    });
  });

  describe("Chat functionality without GitHub configuration", () => {
    it("client starts without GitHub credentials", async () => {
      const mockSession = createMockSession();
      const mockClient = createMockClient(mockSession);
      setMockClient(mockClient);

      const client = await getOrCreateClient(validAirGapConfig);

      expect(client).toBeDefined();
      expect(mockClient.start).toHaveBeenCalledOnce();
      expect(constructorSpy).toHaveBeenCalledWith({});
    });

    it("session creation succeeds with only Azure config", async () => {
      const mockSession = createMockSession();
      const mockClient = createMockClient(mockSession);
      setMockClient(mockClient);

      const session = await getOrCreateSession("conv-3", validAirGapConfig);

      expect(session).toBeDefined();
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("multiple sessions work without GitHub auth", async () => {
      const mockSession1 = createMockSession();
      const mockSession2 = createMockSession();
      const mockClient = createMockClient(mockSession1);
      setMockClient(mockClient);

      mockClient.createSession
        .mockResolvedValueOnce(mockSession1)
        .mockResolvedValueOnce(mockSession2);

      await getOrCreateSession("conv-4", validAirGapConfig);
      await getOrCreateSession("conv-5", validAirGapConfig);

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });
  });

  describe("Extension settings schema air-gap compliance", () => {
    it("package.json does not define GitHub-related settings", async () => {
      const packageJson = await import("../../package.json");
      const configProps = packageJson.contributes?.configuration?.properties;

      if (configProps) {
        const settingKeys = Object.keys(configProps);
        const githubRelatedSettings = settingKeys.filter((key) =>
          key.toLowerCase().includes("github")
        );
        expect(githubRelatedSettings).toHaveLength(0);
      }
    });

    it("all extension settings are under enclave.copilot namespace", async () => {
      const packageJson = await import("../../package.json");
      const configProps = packageJson.contributes?.configuration?.properties;

      if (configProps) {
        const settingKeys = Object.keys(configProps);
        for (const key of settingKeys) {
          expect(key).toMatch(/^enclave\.copilot\./);
        }
      }
    });
  });

  describe("Provider configuration is Azure-only", () => {
    it("provider type is 'openai' for Azure AI Foundry compatibility", async () => {
      const mockSession = createMockSession();
      const mockClient = createMockClient(mockSession);
      setMockClient(mockClient);

      await getOrCreateSession("conv-6", validAirGapConfig);

      const callArg = mockClient.createSession.mock.calls[0][0];
      expect(callArg.provider.type).toBe("openai");
    });

    it("no GitHub-specific provider fields in session config", async () => {
      const mockSession = createMockSession();
      const mockClient = createMockClient(mockSession);
      setMockClient(mockClient);

      await getOrCreateSession("conv-7", validAirGapConfig);

      const callArg = mockClient.createSession.mock.calls[0][0];
      const provider = callArg.provider;

      expect(provider).not.toHaveProperty("githubToken");
      expect(provider).not.toHaveProperty("githubUrl");
      expect(provider).not.toHaveProperty("octokit");
    });
  });

  describe("No external network calls except configured endpoint", () => {
    it("copilotService only imports from @github/copilot-sdk", async () => {
      const serviceSource = await import("../copilotService.js");
      const sourceText = serviceSource.getOrCreateClient.toString();

      // Should only import the SDK, not make HTTP calls
      expect(sourceText).toMatch(/@github\/copilot-sdk/);
      expect(sourceText).not.toMatch(/fetch\(/);
      expect(sourceText).not.toMatch(/axios/);
      expect(sourceText).not.toMatch(/http\.request/);
      expect(sourceText).not.toMatch(/https\.request/);
    });

    it("configuration module does not make HTTP calls", async () => {
      const configSource = await import("../configuration.js");
      const sourceText = configSource.getConfiguration.toString() +
        configSource.validateConfiguration.toString();

      expect(sourceText).not.toMatch(/fetch\(/);
      expect(sourceText).not.toMatch(/axios/);
      expect(sourceText).not.toMatch(/http\.request/);
      expect(sourceText).not.toMatch(/https\.request/);
    });
  });
});
