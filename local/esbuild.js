const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["src/test.ts"],  // 入口文件
  bundle: true,                   // 打包所有依赖
  platform: "node",               // 目标平台（node 或 browser）
  outfile: "dist/test.js",      // 输出文件
//   minify: true,                  // 是否压缩
  sourcemap: true,               // 生成 sourcemap
  external: ["node-gyp-build", "tree-sitter", "tree-sitter-python"],  // 排除原生模块
}).catch(() => process.exit(1));