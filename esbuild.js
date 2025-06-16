const { build } = require("esbuild");
const { copy } = require("esbuild-plugin-copy");
const fs = require('fs');
const path = require('path');

function deleteFolderRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  // 读取目录内容
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 递归删除子目录
      deleteFolderRecursive(fullPath);
    } else {
      // 删除文件
      fs.unlinkSync(fullPath);
      console.log(`已删除文件: ${fullPath}`);
    }
  }

  // 删除空目录
  fs.rmdirSync(dirPath);
  console.log(`已删除目录: ${dirPath}`);
}

//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/** @type BuildOptions */
const baseConfig = {
  bundle: true,
  minify: process.env.NODE_ENV === "production",
  sourcemap: process.env.NODE_ENV !== "production",
};

// Config for extension source code (to be run in a Node-based context)
/** @type BuildOptions */
const extensionConfig = {
  ...baseConfig,
  platform: "node",
  mainFields: ["module", "main"],
  format: "cjs",
  entryPoints: ["./src/extension.ts"],
  outfile: "./out/extension.js",
  external: ["vscode"],
};

// Config for webview source code (to be run in a web-based context)
/** @type BuildOptions */
const webviewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/main.ts"],
  outfile: "./out/webview.js",
  plugins: [
    // Copy webview css and ttf files to `out` directory unaltered
    copy({
      resolveFrom: "cwd",
      assets: {
        from: ["./src/webview/*.css", "./src/webview/*.ttf"],
        to: ["./out"],
      },
      watch: true,
    }),
  ],
};

// This watch config adheres to the conventions of the esbuild-problem-matchers
// extension (https://github.com/connor4312/esbuild-problem-matchers#esbuild-via-js)
/** @type BuildOptions */
const watchConfig = {
  watch: {
    onRebuild(error, result) {
      console.log("[watch] build started");
      if (error) {
        error.errors.forEach((error) =>
          console.error(
            `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`
          )
        );
      } else {
        console.log("[watch] build finished");
      }
    },
  },
};

// Build script
(async () => {
  const args = process.argv.slice(2);
  deleteFolderRecursive("./out");
  try {
    if (args.includes("--watch")) {
      // Build and watch extension and webview code
      var now = new Date();
      console.log(
        `[watch] build started at ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}`
      );
      await build({
        ...extensionConfig,
        ...watchConfig,
      });
      await build({
        ...webviewConfig,
        ...watchConfig,
      });
      now = new Date();
      console.log(
        `[watch] build finished at ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}`
      );
    } else {
      // Build extension and webview code
      await build(extensionConfig);
      await build(webviewConfig);
      console.log("build complete");
    }
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
