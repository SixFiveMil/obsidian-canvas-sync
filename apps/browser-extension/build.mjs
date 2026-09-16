import { mkdir, copyFile, rm } from "node:fs/promises";
import esbuild from "esbuild";

const target = process.argv[2] === "firefox" ? "firefox" : "chrome";
const outdir = `dist/${target}`;

await rm("dist", { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await esbuild.build({
  entryPoints: ["src/background.ts", "src/popup.ts"],
  outdir,
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: false,
  logLevel: "info"
});

const manifestName = target === "firefox" ? "manifest.firefox.json" : "manifest.chrome.json";
await copyFile(manifestName, `${outdir}/manifest.json`);
await copyFile("src/popup.html", `${outdir}/popup.html`);
await copyFile("assets/icon16.png", `${outdir}/icon16.png`);
await copyFile("assets/icon32.png", `${outdir}/icon32.png`);
await copyFile("assets/icon48.png", `${outdir}/icon48.png`);
await copyFile("assets/icon128.png", `${outdir}/icon128.png`);

console.log(`Built extension for ${target} in ${outdir}`);
