import { execSync, execFileSync, spawn } from "child_process";
import { statSync } from "fs";
import { ExtensionConfig } from "./configuration.js";
import { getManagedCliPath } from "./cliInstaller.js";
import type {
  CopilotClient,
  ICopilotSession,
  MCPLocalServerConfig,
  MCPRemoteServerConfig,
  PermissionHandler,
  ProviderConfig,
  RemoteMcpSettings,
  SessionMetadata,
  ConversationMetadata,
  ResumeSessionConfig,
} from "./types.js";

let client: CopilotClient | undefined;
const sessions = new Map<string, ICopilotSession>();
const sessionConfigHashes = new Map<string, string>();

/**
 * Result of validating the copilot CLI binary.
 */
export type CopilotCliValidationResult =
  | { valid: true; version: string; path: string }
  | { valid: false; reason: "not_found" | "wrong_binary" | "version_check_failed"; path?: string; details?: string };

/**
 * Resolves spawn command and arguments for a CLI path.
 *
 * `.js` files cannot be spawned as executables on Windows (no shebang support)
 * and may lack execute permissions on Unix after npm install. We prepend the
 * current Node.js binary (`process.execPath`) as the command for all platforms,
 * matching the SDK's own behavior in CopilotClient.start().
 */
function resolveCliSpawnArgs(cliPath: string, args: readonly string[]): { command: string; args: string[] } {
  if (cliPath.toLowerCase().endsWith(".js")) {
    return { command: process.execPath, args: [cliPath, ...args] };
  }
  return { command: cliPath, args: [...args] };
}

/**
 * Attempts to find the `copilot` CLI binary on PATH.
 * Returns the resolved path or undefined if not found.
 */
function resolveCopilotCliFromPath(): string | undefined {
  try {
    const cmd = process.platform === "win32" ? "where copilot" : "which copilot";
    const result = execSync(cmd, { encoding: "utf8", timeout: 5000 })
      .trim()
      .split("\n")[0];
    return result || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates that a CLI binary is actually the @github/copilot CLI.
 * 
 * Runs `<cliPath> --version` and checks that it returns a version number without error.
 * The @github/copilot CLI supports `--version` and returns version output; other `copilot`
 * binaries may not support this flag or may fail.
 * 
 * @param cliPath - Path to the CLI binary to validate
 * @returns Validation result with version string if valid, or error details if invalid
 */
export function validateCopilotCli(cliPath: string): Promise<CopilotCliValidationResult> {
  return new Promise((resolve) => {
    try {
      try {
        if (statSync(cliPath).isDirectory()) {
          resolve({
            valid: false,
            reason: "version_check_failed",
            path: cliPath,
            details: "Configured cliPath points to a directory. Set forge.copilot.cliPath to the Copilot executable file path.",
          });
          return;
        }
      } catch {
        // Ignore stat errors here and defer to execFileSync for final validation.
      }

      const spawnInfo = resolveCliSpawnArgs(cliPath, ["--version"]);
      const output = execFileSync(spawnInfo.command, spawnInfo.args, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();

      // If we got output without error, check if it looks like a version
      // The @github/copilot CLI returns version info. We just need to verify
      // it didn't error out (wrong binary might not support --version)
      if (output && output.length > 0) {
        resolve({ valid: true, version: output, path: cliPath });
      } else {
        resolve({
          valid: false,
          reason: "version_check_failed",
          path: cliPath,
          details: "No version output returned",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();

      // Check if binary wasn't found
      if (lower.includes("enoent") || lower.includes("not found") || lower.includes("cannot find")) {
        resolve({
          valid: false,
          reason: "not_found",
          path: cliPath,
          details: message,
        });
      } else {
        // Binary exists but returned error — likely wrong binary
        resolve({
          valid: false,
          reason: "wrong_binary",
          path: cliPath,
          details: message,
        });
      }
    }
  });
}

/**
 * Probes CLI compatibility by attempting to start it in headless mode.
 * 
 * Spawns the CLI with --headless --no-auto-update --stdio and treats it as
 * compatible only if it stays alive for a short grace period.
 * 
 * @param cliPath - Path to the CLI binary to probe
 * @returns Compatibility result with error details if incompatible
 */
const PROBE_REQUIRED_FLAGS = ["--headless", "--no-auto-update", "--stdio"] as const;
const PROBE_GRACE_PERIOD_MS = 100;
const PROBE_TIMEOUT_MS = 5000;

function hasUnsupportedFlagError(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("unknown option") || lower.includes("unrecognized");
}

export async function probeCliCompatibility(
  cliPath: string
): Promise<{ compatible: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let stderrText = "";
    let graceTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let child: ReturnType<typeof spawn> | undefined;

    const resolveCompatible = (): void => {
      finalize({ compatible: true });
    };

    const resolveIncompatible = (error: string): void => {
      finalize({ compatible: false, error });
    };

    const finalize = (result: { compatible: boolean; error?: string }): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (graceTimer) {
        clearTimeout(graceTimer);
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      if (child && child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGTERM");
        } catch {
          // Process may have already exited.
        }
      }
      resolve(result);
    };

    try {
      const spawnInfo = resolveCliSpawnArgs(cliPath, [...PROBE_REQUIRED_FLAGS]);
      child = spawn(spawnInfo.command, spawnInfo.args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      resolveIncompatible(`CLI startup probe failed: ${message}`);
      return;
    }

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrText += chunk.toString();
    });

    child.on("error", (err: Error) => {
      if (hasUnsupportedFlagError(err.message) || hasUnsupportedFlagError(stderrText)) {
        resolveIncompatible(
          "CLI does not support required flags (--headless, --no-auto-update, --stdio). Ensure you have GitHub Copilot CLI installed, not a different 'copilot' binary."
        );
        return;
      }
      resolveIncompatible(`CLI startup probe failed: ${err.message}`);
    });

    child.on("exit", (code, signal) => {
      if (settled) {
        return;
      }

      const trimmedStderr = stderrText.trim();
      if (hasUnsupportedFlagError(trimmedStderr)) {
        resolveIncompatible(
          "CLI does not support required flags (--headless, --no-auto-update, --stdio). Ensure you have GitHub Copilot CLI installed, not a different 'copilot' binary."
        );
        return;
      }

      const exitReason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      resolveIncompatible(
        `CLI exited before startup probe completed (${exitReason})${trimmedStderr ? `: ${trimmedStderr}` : ""}`
      );
    });

    graceTimer = setTimeout(() => {
      resolveCompatible();
    }, PROBE_GRACE_PERIOD_MS);

    timeoutTimer = setTimeout(() => {
      resolveIncompatible(`CLI startup probe timed out after ${PROBE_TIMEOUT_MS}ms`);
    }, PROBE_TIMEOUT_MS);
  });
}

/**
 * Discovers and validates the Copilot CLI binary.
 * 
 * Resolution order:
 * 1. If configuredPath is provided, validate it directly.
 * 2. If globalStoragePath is provided, validate the managed CLI install path.
 * 3. On Windows with globalStoragePath, skip PATH discovery.
 * 4. Otherwise, discover from PATH and validate.
 * 
 * @param configuredPath - Optional explicit CLI path from user configuration
 * @param globalStoragePath - Optional extension global storage path for managed CLI lookup
 * @returns Validation result with discovered/configured CLI path
 */
export async function discoverAndValidateCli(
  configuredPath?: string,
  globalStoragePath?: string
): Promise<CopilotCliValidationResult> {
  // If configured path is provided, validate it directly
  if (configuredPath && configuredPath.trim() !== "") {
    return validateCopilotCli(configuredPath);
  }

  // If extension storage is available, only trust the managed install path.
  // On Windows, this avoids auto-picking unrelated system-level "copilot.exe" binaries.
  if (globalStoragePath) {
    const managedPath = await getManagedCliPath(globalStoragePath);
    if (managedPath) {
      return validateCopilotCli(managedPath);
    }

    if (process.platform === "win32") {
      return {
        valid: false,
        reason: "not_found",
        details: "No managed Copilot CLI found in extension storage and no cliPath configured",
      };
    }
  }

  // Otherwise, discover from PATH
  const discoveredPath = resolveCopilotCliFromPath();
  if (!discoveredPath) {
    return {
      valid: false,
      reason: "not_found",
      details: "No copilot binary found on PATH and no cliPath configured",
    };
  }

  // Validate the discovered binary
  return validateCopilotCli(discoveredPath);
}

export class CopilotCliNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotCliNotFoundError";
  }
}

export class CopilotCliNeedsInstallError extends Error {
  constructor() {
    super("No compatible Copilot CLI found. Installation required.");
    this.name = "CopilotCliNeedsInstallError";
  }
}

function formatCliStartupDiagnostics(cliPath: string | undefined, details: string): string {
  const attemptedPath = cliPath ?? "(none)";
  return `Attempted CLI path: ${attemptedPath}\nStartup error: ${details}`;
}

export async function getOrCreateClient(
  config: ExtensionConfig,
  globalStoragePath?: string
): Promise<CopilotClient> {
  if (client) {
    return client;
  }

  // Resolution chain:
  // 1. Configured path (forge.copilot.cliPath) — explicit user override
  // 2. Managed copy — check globalStoragePath
  // 3. PATH discovery (skip on Windows when globalStoragePath is available)
  // 4. If none found, throw CopilotCliNeedsInstallError

  let resolvedCliPath: string | undefined;

  // Step 1: Check configured path
  const configuredCliPath = config.cliPath.trim() !== "" ? config.cliPath.trim() : undefined;
  if (configuredCliPath) {
    const validation = await validateCopilotCli(configuredCliPath);
    if (!validation.valid) {
      if (validation.reason === "not_found") {
        throw new CopilotCliNotFoundError(
          "Copilot CLI not found at configured forge.copilot.cliPath.\n" +
          `Attempted CLI path: ${configuredCliPath}\n` +
          `Validation error: ${validation.details ?? "Unknown error"}`
        );
      }
      if (validation.reason === "version_check_failed" && validation.details?.toLowerCase().includes("directory")) {
        throw new CopilotCliNotFoundError(
          "forge.copilot.cliPath points to a directory. Set it to the Copilot executable file path (for example, /usr/local/bin/copilot)."
        );
      }
      throw new CopilotCliNotFoundError(
        "The configured Copilot CLI path is invalid. Set forge.copilot.cliPath to the GitHub Copilot CLI executable.\n" +
        `Attempted CLI path: ${configuredCliPath}\n` +
        `Validation error: ${validation.details ?? "Unknown error"}`
      );
    }
    resolvedCliPath = configuredCliPath;
  }

  // Step 2: Check managed copy if no configured path
  if (!resolvedCliPath && globalStoragePath) {
    const managedPath = await getManagedCliPath(globalStoragePath);
    if (managedPath) {
      resolvedCliPath = managedPath;
    }
  }

  // Step 3: Check PATH unless we're on Windows with extension storage path available
  if (!resolvedCliPath && (!globalStoragePath || process.platform !== "win32")) {
    const pathDiscovery = resolveCopilotCliFromPath();
    if (pathDiscovery) {
      const validation = await validateCopilotCli(pathDiscovery);
      if (validation.valid) {
        resolvedCliPath = pathDiscovery;
      }
    }
  }

  // Step 4: If still not found, throw CopilotCliNeedsInstallError
  if (!resolvedCliPath) {
    throw new CopilotCliNeedsInstallError();
  }

  // Probe CLI compatibility before using it
  const probeResult = await probeCliCompatibility(resolvedCliPath);
  if (!probeResult.compatible) {
    throw new CopilotCliNotFoundError(
      `Copilot CLI failed compatibility check.\n` +
      `Attempted CLI path: ${resolvedCliPath}\n` +
      `Error: ${probeResult.error ?? "Unknown error"}`
    );
  }

  const { CopilotClient: SDKCopilotClient } = await import(
    "@github/copilot-sdk"
  );

  const clientOptions: Record<string, unknown> = {
    cliPath: resolvedCliPath,
  };

  try {
    client = new SDKCopilotClient(clientOptions);
    await client.start();
  } catch (err: unknown) {
    client = undefined;
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    if (
      lower.includes("--headless") ||
      lower.includes("unknown option") ||
      (lower.includes("exited with code") && lower.includes("stderr"))
    ) {
      throw new CopilotCliNotFoundError(
        "Copilot CLI failed to start. Verify forge.copilot.cliPath points to the GitHub Copilot CLI executable.\n" +
        formatCliStartupDiagnostics(resolvedCliPath, message)
      );
    }
    if (
      lower.includes("not found") ||
      lower.includes("enoent") ||
      lower.includes("cannot find") ||
      lower.includes("cannot resolve")
    ) {
      throw new CopilotCliNotFoundError(
        "Copilot CLI not found from the extension host environment. Install GitHub Copilot CLI (npm, winget, Homebrew, or install script) or set forge.copilot.cliPath.\n" +
        formatCliStartupDiagnostics(resolvedCliPath, message)
      );
    }
    throw err;
  }

  return client;
}

/**
 * Builds a provider configuration for BYOK mode.
 */
function buildProviderConfig(config: ExtensionConfig, authToken: string): ProviderConfig {
  const wireApi =
    config.wireApi === "completions" || config.wireApi === "responses"
      ? config.wireApi
      : undefined;

  // Auth strategy:
  // - apiKey mode: static API key passed as `apiKey` in ProviderConfig.
  // - entraId mode: bearer token from DefaultAzureCredential passed as `bearerToken`.
  //   NOTE: bearerToken is static — Entra ID tokens expire after ~1hr.
  //   Long sessions may need session rotation. Tracked in #27.
  //   Session-per-conversation means token refresh at session creation is sufficient
  //   (~1 hr token lifetime).
  // TODO(#27): If Copilot SDK adds native Entra / managed-identity support, refactor
  //   to use SDK-native auth instead of manual token acquisition.
  const isAzure = /\.azure\.com/i.test(config.endpoint);
  return {
    type: isAzure ? "azure" : "openai",
    baseUrl: config.endpoint,
    wireApi,
    ...(config.authMethod === "entraId"
      ? { bearerToken: authToken }
      : { apiKey: authToken }),
    ...(isAzure && { azure: { apiVersion: "2024-10-21" } }),
  };
}

/**
 * Builds MCP server configuration for the SDK's createSession/resumeSession.
 *
 * Maps our simplified McpServerConfig / RemoteMcpSettings to the SDK's
 * MCPLocalServerConfig or MCPRemoteServerConfig shape. Supports both local
 * (stdio) and remote (HTTP/SSE) transports.
 */
function buildMcpServersConfig(config: ExtensionConfig): Record<string, MCPLocalServerConfig | MCPRemoteServerConfig> | undefined {
  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    return undefined;
  }

  const mcpServers: Record<string, MCPLocalServerConfig | MCPRemoteServerConfig> = {};
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    if ('url' in serverConfig) {
      const remote = serverConfig as RemoteMcpSettings;
      mcpServers[name] = {
        type: "http" as const,
        url: remote.url,
        tools: ["*"],
        ...(remote.headers && { headers: remote.headers }),
      };
    } else {
      console.warn(`[forge] MCP server "${name}" configured with command: ${serverConfig.command}`);
      mcpServers[name] = {
        type: "local" as const,
        command: serverConfig.command,
        args: serverConfig.args ?? [],
        tools: ["*"],
        ...(serverConfig.env && { env: serverConfig.env }),
      };
    }
  }
  return mcpServers;
}

/**
 * Builds tool configuration from individual boolean settings.
 */
function buildToolConfig(config: ExtensionConfig): { excludedTools?: string[] } {
  const excludedTools: string[] = [];
  if (!config.toolShell) excludedTools.push("shell");
  if (!config.toolRead) excludedTools.push("read");
  if (!config.toolWrite) excludedTools.push("write");
  if (!config.toolUrl) excludedTools.push("url");
  if (!config.toolMcp) excludedTools.push("mcp");
  
  if (excludedTools.length > 0) {
    return { excludedTools };
  }
  return {};
}

export async function getOrCreateSession(
  conversationId: string,
  config: ExtensionConfig,
  authToken: string,
  model: string,
  globalStoragePath?: string,
  onPermissionRequest?: PermissionHandler,
): Promise<ICopilotSession> {
  const configHash = config.endpoint + "|" + config.authMethod + "|" + model + "|" + config.wireApi + "|" + authToken;
  const existing = sessions.get(conversationId);
  if (existing) {
    if (sessionConfigHashes.get(conversationId) === configHash) {
      return existing;
    }
    await destroySession(conversationId);
  }

  const copilotClient = await getOrCreateClient(config, globalStoragePath);
  const provider = buildProviderConfig(config, authToken);
  const toolConfig = buildToolConfig(config);
  const mcpServers = buildMcpServersConfig(config);

  const session = (await copilotClient.createSession({
    sessionId: conversationId,
    model,
    provider,
    streaming: true,
    ...toolConfig,
    ...(mcpServers && { mcpServers }),
    ...(config.systemMessage && { systemMessage: { content: config.systemMessage } }),
    ...(onPermissionRequest && { onPermissionRequest }),
  })) as unknown as ICopilotSession;

  if (typeof session.send !== 'function' || typeof session.on !== 'function') {
    throw new Error('SDK session shape mismatch — check @github/copilot-sdk version');
  }

  sessions.set(conversationId, session);
  sessionConfigHashes.set(conversationId, configHash);
  return session;
}

/** Removes session from cache WITHOUT aborting. Use destroySession() for clean cleanup. */
export function removeSession(conversationId: string): void {
  sessions.delete(conversationId);
  sessionConfigHashes.delete(conversationId);
}

export async function destroySession(conversationId: string): Promise<void> {
  const session = sessions.get(conversationId);
  if (!session) {
    return;
  }

  try {
    await session.abort();
  } catch (err) {
    // Session may already be ended — log and continue
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to abort session ${conversationId}: ${message}`);
  }

  sessions.delete(conversationId);
  sessionConfigHashes.delete(conversationId);
}

export async function destroyAllSessions(): Promise<void> {
  const abortPromises: Promise<void>[] = [];

  for (const [conversationId, session] of sessions.entries()) {
    if (!session) {
      console.warn(`Session ${conversationId} is undefined, skipping abort`);
      continue;
    }
    let abortPromise: Promise<void>;
    try {
      abortPromise = session.abort();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to abort session ${conversationId}: ${message}`);
      continue;
    }
    abortPromises.push(
      abortPromise.catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Failed to abort session ${conversationId}: ${message}`);
      })
    );
  }

  await Promise.all(abortPromises);
  sessions.clear();
  sessionConfigHashes.clear();
}

/**
 * Lists all available conversations.
 * 
 * Wraps the SDK's `client.listSessions()` and maps SessionMetadata to ConversationMetadata.
 */
export async function listConversations(config: ExtensionConfig, globalStoragePath?: string): Promise<ConversationMetadata[]> {
  try {
    const copilotClient = await getOrCreateClient(config, globalStoragePath);
    const sessionList: SessionMetadata[] = await copilotClient.listSessions();
    
    return sessionList.map((s) => ({
      sessionId: s.sessionId,
      summary: s.summary,
      startTime: s.startTime,
      modifiedTime: s.modifiedTime,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to list conversations: ${message}`);
  }
}

/**
 * Resumes an existing conversation by session ID.
 * 
 * Wraps the SDK's `client.resumeSession()`, applies the same provider and tool config
 * as `getOrCreateSession`, and stores the session in the local sessions map.
 */
export async function resumeConversation(
  sessionId: string,
  config: ExtensionConfig,
  authToken: string,
  model: string,
  globalStoragePath?: string,
  onPermissionRequest?: PermissionHandler,
): Promise<ICopilotSession> {
  try {
    const copilotClient = await getOrCreateClient(config, globalStoragePath);
    const provider = buildProviderConfig(config, authToken);
    const toolConfig = buildToolConfig(config);
    const mcpServers = buildMcpServersConfig(config);

    const resumeConfig: ResumeSessionConfig = {
      model,
      provider,
      streaming: true,
      ...toolConfig,
      ...(mcpServers && { mcpServers }),
      ...(config.systemMessage && { systemMessage: { content: config.systemMessage } }),
      ...(onPermissionRequest && { onPermissionRequest }),
    };

    const session = (await copilotClient.resumeSession(
      sessionId,
      resumeConfig
    )) as unknown as ICopilotSession;

    if (typeof session.send !== 'function' || typeof session.on !== 'function') {
      throw new Error('SDK session shape mismatch — check @github/copilot-sdk version');
    }

    // Store in local sessions map so it can be managed alongside new sessions
    sessions.set(sessionId, session);
    return session;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to resume conversation ${sessionId}: ${message}. The session may not exist or may have been deleted.`
    );
  }
}

/**
 * Gets the ID of the most recently updated conversation.
 * 
 * Wraps the SDK's `client.getLastSessionId()`.
 */
export async function getLastConversationId(config: ExtensionConfig, globalStoragePath?: string): Promise<string | undefined> {
  try {
    const copilotClient = await getOrCreateClient(config, globalStoragePath);
    return await copilotClient.getLastSessionId();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to get last conversation ID: ${message}`);
  }
}

/**
 * Deletes a conversation and its data from disk.
 * 
 * Wraps the SDK's `client.deleteSession()` and also removes the session
 * from the local sessions map if present.
 */
export async function deleteConversation(sessionId: string, config: ExtensionConfig, globalStoragePath?: string): Promise<void> {
  try {
    const copilotClient = await getOrCreateClient(config, globalStoragePath);
    await copilotClient.deleteSession(sessionId);
    
    // Remove from local map if present
    sessions.delete(sessionId);
    sessionConfigHashes.delete(sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to delete conversation ${sessionId}: ${message}. The session may not exist or deletion may have failed.`
    );
  }
}

export async function stopClient(): Promise<void> {
  await destroyAllSessions();
  if (client) {
    try {
      await client.stop();
    } finally {
      client = undefined;
    }
  }
}

export function resetClient(): void {
  client = undefined;
  sessions.clear();
  sessionConfigHashes.clear();
}
