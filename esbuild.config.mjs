import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    "http",
    "https",
    "net",
    "url",
    "node:http",
    "node:https",
    "node:net"
  ],
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: watch,
  outfile: "main.js",
  logLevel: "info"
});

if (watch) {
  await ctx.watch();
  console.log("Watching Obsidian plugin...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
