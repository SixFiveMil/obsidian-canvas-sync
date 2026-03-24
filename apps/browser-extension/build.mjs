import { mkdir, copyFile, rm } from "node:fs/promises";
import esbuild from "esbuild";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await esbuild.build({
  entryPoints: ["src/background.ts", "src/popup.ts"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: false,
  logLevel: "info"
});

await copyFile("manifest.json", "dist/manifest.json");
await copyFile("src/popup.html", "dist/popup.html");
await copyFile("assets/icon16.png", "dist/icon16.png");
await copyFile("assets/icon32.png", "dist/icon32.png");
await copyFile("assets/icon48.png", "dist/icon48.png");
await copyFile("assets/icon128.png", "dist/icon128.png");
