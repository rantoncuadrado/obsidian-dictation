import esbuild from "esbuild";
import process from "node:process";

const production = process.argv[2] === "production";
const context = await esbuild.context({
  banner: {
    js: "/* Generated from src/main.ts. Do not edit main.js directly. */",
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "main.js",
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2022",
  treeShaking: true,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
