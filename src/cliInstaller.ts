import { execFile } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { get as httpsGet } from "https";
import { join } from "path";

/**
 * Subdirectory name within globalStoragePath for managed CLI installation.
 */
export const CLI_INSTALL_DIR = "copilot-cli";

// Injected at build time by esbuild from @github/copilot-sdk's package.json.
// See esbuild.config.mjs — no hardcoded version to maintain.
declare const __COPILOT_CLI_VERSION__: string;

export interface CliInstallResult {
  success: boolean;
  cliPath?: string;
  version?: string;
  error?: string;
  method?: "npm" | "http-tarball";
}

export interface CliInstallOptions {
  globalStoragePath: string;
  targetVersion?: string;
}

/**
 * Gets the target CLI package version.
 * If not provided, resolves @github/copilot version from @github/copilot-sdk metadata.
 */
function getTargetVersion(options: CliInstallOptions): string {
  const normalizeVersion = (version: string): string =>
    version.trim().replace(/^[~^]/, "");

  if (options.targetVersion) {
    return normalizeVersion(options.targetVersion);
  }

  // Prefer the copilot dependency declared by the installed SDK package.
  try {
    const sdkPackageJsonPath = join(
      __dirname,
      "..",
      "node_modules",
      "@github",
      "copilot-sdk",
      "package.json"
    );
    const sdkPackageJson = JSON.parse(readFileSync(sdkPackageJsonPath, "utf8"));
    const copilotVersion = sdkPackageJson.dependencies?.["@github/copilot"];
    if (!copilotVersion) {
      throw new Error(
        "@github/copilot dependency not found in @github/copilot-sdk package metadata"
      );
    }
    return normalizeVersion(copilotVersion);
  } catch {
    // Fallback: support repos that pin @github/copilot directly.
    try {
      const packageJsonPath = join(__dirname, "..", "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      const directCopilotVersion = packageJson.dependencies?.["@github/copilot"];
      if (!directCopilotVersion) {
        throw new Error("@github/copilot version not found in package.json");
      }
      return normalizeVersion(directCopilotVersion);
    } catch {
      // .vsix packages exclude node_modules, so metadata files can be unavailable at runtime.
      // Fall back to the CLI version injected at build time from the SDK's package.json.
      return __COPILOT_CLI_VERSION__;
    }
  }
}

/**
 * Returns the path to the platform-specific native CLI binary if it exists.
 *
 * The @github/copilot package ships optional platform packages
 * (e.g. @github/copilot-win32-x64) containing a native binary.  Returning
 * this path instead of npm-loader.js avoids an intermediate Node.js process
 * that spawns the binary without `windowsHide: true`, which causes visible
 * console windows on Windows.
 */
function getPlatformBinaryPath(installDir: string): string | undefined {
  const platformDir = join(
    installDir,
    "node_modules",
    "@github",
    `copilot-${process.platform}-${process.arch}`
  );

  try {
    if (!existsSync(platformDir)) {
      return undefined;
    }
    // Scan for the binary — named "copilot" on Unix, "copilot.exe" on Windows
    const entries = readdirSync(platformDir);
    const binaryName = entries.find(
      (e) => e === "copilot.exe" || (e === "copilot" && !e.includes("."))
    );
    if (binaryName) {
      const binaryPath = join(platformDir, binaryName);
      if (statSync(binaryPath).isFile()) {
        return binaryPath;
      }
    }
  } catch {
    // Fall through
  }
  return undefined;
}

/**
 * Returns the path to the managed CLI binary if installed, undefined otherwise.
 *
 * Only returns the platform-specific native binary — never npm-loader.js.
 * npm-loader.js spawns the platform binary via spawnSync() without
 * windowsHide, causing visible console windows on Windows.  If the platform
 * binary is missing the managed install is considered absent and the normal
 * "CLI not found → install" flow takes over.
 */
export async function getManagedCliPath(
  globalStoragePath: string
): Promise<string | undefined> {
  const installDir = join(globalStoragePath, CLI_INSTALL_DIR);
  return getPlatformBinaryPath(installDir);
}

/**
 * Checks if the managed CLI is installed.
 */
export async function isManagedCliInstalled(
  globalStoragePath: string
): Promise<boolean> {
  return (await getManagedCliPath(globalStoragePath)) !== undefined;
}

/**
 * Attempts to install the CLI using npm.
 * Returns the CLI path on success, or throws on failure.
 */
async function installViaNpm(
  installDir: string,
  version: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "npm",
      ["install", `@github/copilot@${version}`, "--prefix", installDir],
      { timeout: 120000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `npm install failed: ${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`
            )
          );
          return;
        }

        // Only return the native platform binary — never npm-loader.js
        const platformBinary = getPlatformBinaryPath(installDir);
        if (platformBinary) {
          resolve(platformBinary);
        } else {
          reject(new Error(
            `npm install succeeded but platform binary not found for ${process.platform}-${process.arch}`
          ));
        }
      }
    );
  });
}

/**
 * Downloads a file over HTTPS.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    httpsGet(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error("Redirect without location header"));
          return;
        }
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(
            `HTTP ${response.statusCode}: ${response.statusMessage}`
          )
        );
        return;
      }

      const fileStream = createWriteStream(destPath);
      response.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close();
        resolve();
      });

      fileStream.on("error", (err) => {
        fileStream.close();
        reject(err);
      });
    }).on("error", reject);
  });
}

/**
 * Extracts a .tgz file using Node.js streams and the system tar command.
 */
async function extractTarGz(
  tarGzPath: string,
  destDir: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use system tar for reliable extraction
    execFile(
      "tar",
      ["-xzf", tarGzPath, "-C", destDir],
      { timeout: 60000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `tar extraction failed: ${error.message}\nstderr: ${stderr}`
            )
          );
          return;
        }
        resolve();
      }
    );
  });
}

/**
 * Attempts to install the CLI by downloading the tarball from npm registry.
 */
async function installViaHttpTarball(
  installDir: string,
  version: string
): Promise<string> {
  const tarballUrl = `https://registry.npmjs.org/@github/copilot/-/copilot-${version}.tgz`;
  const tarballPath = join(installDir, "copilot.tgz");
  const extractDir = join(installDir, "extracted");

  // Download tarball
  await downloadFile(tarballUrl, tarballPath);

  // Create extraction directory
  mkdirSync(extractDir, { recursive: true });

  // Extract tarball
  await extractTarGz(tarballPath, extractDir);

  // npm tarballs extract to a "package" subdirectory
  const packageDir = join(extractDir, "package");
  const targetNodeModulesDir = join(installDir, "node_modules", "@github");
  mkdirSync(targetNodeModulesDir, { recursive: true });

  // Move package directory to node_modules/@github/copilot
  const targetDir = join(targetNodeModulesDir, "copilot");
  const { renameSync } = await import("fs");
  renameSync(packageDir, targetDir);

  // The @github/copilot package has optionalDependencies for platform-specific binaries.
  // We need to manually install the platform-specific package since we're not using npm.
  const platform = process.platform;
  const arch = process.arch;
  const platformPackage = `@github/copilot-${platform}-${arch}`;
  const platformTarballUrl = `https://registry.npmjs.org/${platformPackage}/-/copilot-${platform}-${arch}-${version}.tgz`;
  const platformTarballPath = join(installDir, "copilot-platform.tgz");
  const platformExtractDir = join(installDir, "platform-extracted");

  try {
    await downloadFile(platformTarballUrl, platformTarballPath);
    mkdirSync(platformExtractDir, { recursive: true });
    await extractTarGz(platformTarballPath, platformExtractDir);

    const platformPackageDir = join(platformExtractDir, "package");
    const platformTargetDir = join(
      targetNodeModulesDir,
      `copilot-${platform}-${arch}`
    );
    renameSync(platformPackageDir, platformTargetDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to install platform-specific binary: ${message}`
    );
  }

  // Only return the native platform binary — never npm-loader.js
  const platformBinary = getPlatformBinaryPath(installDir);
  if (platformBinary) {
    return platformBinary;
  }
  throw new Error(
    `HTTP tarball install succeeded but platform binary not found for ${process.platform}-${process.arch}`
  );
}

/**
 * Installs the Copilot CLI into the extension's globalStoragePath.
 *
 * Tries npm first, falls back to HTTP tarball download if npm is not available.
 */
export async function installCopilotCli(
  options: CliInstallOptions
): Promise<CliInstallResult> {
  const version = getTargetVersion(options);
  const installDir = join(options.globalStoragePath, CLI_INSTALL_DIR);

  // Create install directory
  try {
    mkdirSync(installDir, { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to create install directory: ${message}`,
    };
  }

  // Write minimal package.json
  const packageJsonPath = join(installDir, "package.json");
  const packageJson = {
    name: "forge-copilot-cli",
    private: true,
  };
  try {
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to write package.json: ${message}`,
    };
  }

  // Try npm install first
  try {
    const cliPath = await installViaNpm(installDir, version);
    return {
      success: true,
      cliPath,
      version,
      method: "npm",
    };
  } catch (npmError) {
    const npmMessage =
      npmError instanceof Error ? npmError.message : String(npmError);

    // Check if npm is not available (ENOENT) or if npm failed for other reasons
    if (
      npmMessage.toLowerCase().includes("enoent") ||
      npmMessage.toLowerCase().includes("not found")
    ) {
      // npm not on PATH — try HTTP tarball fallback
      try {
        const cliPath = await installViaHttpTarball(installDir, version);
        return {
          success: true,
          cliPath,
          version,
          method: "http-tarball",
        };
      } catch (httpError) {
        const httpMessage =
          httpError instanceof Error ? httpError.message : String(httpError);
        return {
          success: false,
          error: `npm not available and HTTP tarball install failed: ${httpMessage}`,
        };
      }
    } else {
      // npm failed for reasons other than not being on PATH — report npm error
      return {
        success: false,
        error: `npm install failed: ${npmMessage}`,
      };
    }
  }
}
