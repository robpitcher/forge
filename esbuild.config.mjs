import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

// Shim for import.meta.resolve which is ESM-only. esbuild's CJS conversion
// replaces import.meta with a plain object, dropping the resolve() method.
// This polyfill walks node_modules like Node would, bypassing exports-map
// restrictions that prevent require.resolve() from finding ESM-only exports.
const importMetaResolveShim = `
var __importMetaResolve = (function() {
  var _path = require("node:path");
  var _url = require("node:url");
  var _fs = require("node:fs");
  return function(specifier) {
    var parts = specifier.split("/");
    var pkgName = parts[0].startsWith("@") ? parts.slice(0,2).join("/") : parts[0];
    var subpath = parts.slice(pkgName.split("/").length);
    var dir = __dirname;
    while (true) {
      var base = _path.join(dir, "node_modules", pkgName);
      if (_fs.existsSync(base)) {
        var target = subpath.length ? _path.join(base, ...subpath) : base;
        if (!_fs.existsSync(target) && _fs.existsSync(target + ".js")) target += ".js";
        if (_fs.existsSync(target) && _fs.statSync(target).isDirectory()) target = _path.join(target, "index.js");
        return _url.pathToFileURL(target).href;
      }
      var parent = _path.dirname(dir);
      if (parent === dir) throw new Error("Cannot resolve module: " + specifier);
      dir = parent;
    }
  };
})();`;

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  minify: production,
  sourcemap: !production,
  banner: { js: importMetaResolveShim },
  define: { "import.meta.resolve": "__importMetaResolve" },
};

// Webview bundle — bundles media/chat.js with marked for markdown rendering
const webviewBuildOptions = {
  entryPoints: ["media/chat.js"],
  bundle: true,
  outfile: "dist/chat.js",
  platform: "browser",
  format: "iife",
  minify: production,
  sourcemap: !production,
};

if (watch) {
  const [ctx, webCtx] = await Promise.all([
    esbuild.context(buildOptions),
    esbuild.context(webviewBuildOptions),
  ]);
  await Promise.all([ctx.watch(), webCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(buildOptions),
    esbuild.build(webviewBuildOptions),
  ]);
  console.log("Build complete.");
}
