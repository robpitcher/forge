import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sdkPkg = JSON.parse(readFileSync("node_modules/@github/copilot-sdk/package.json", "utf8"));
const copilotCliVersion = sdkPkg.dependencies["@github/copilot"].replace(/^[~^]/, "");

export default defineConfig({
  define: {
    "__COPILOT_CLI_VERSION__": JSON.stringify(copilotCliVersion),
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    alias: {
      vscode: path.resolve(__dirname, "src/test/__mocks__/vscode.ts"),
    },
  },
});
