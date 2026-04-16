const esbuild = require("esbuild");

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outdir: "dist",
    external: ["vscode"],
    format: "cjs",
    sourcemap: !isProduction,
    minify: isProduction,
    platform: "node",
    target: "node18",
    logLevel: isWatch ? "info" : "warning",
    plugins: [webviewPlugin],
  });

  if (isWatch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

const webviewPlugin = {
  name: "webview",
  setup(build) {
    build.onResolve({ filter: /^webview:/ }, (args) => ({
      path: args.path.replace("webview:", ""),
      namespace: "webview",
    }));
    build.onLoad({ filter: /.*/, namespace: "webview" }, async (args) => {
      const esbuild = require("esbuild");
      const path = require("path");
      const entryPoint = path.resolve(__dirname, "src", "webview", `${args.path}.ts`);
      const result = await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        write: false,
        format: "iife",
        target: "es2020",
        minify: isProduction,
      });
      return { contents: result.outputFiles[0].text, loader: "text" };
    });
  },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
