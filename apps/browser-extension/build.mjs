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
