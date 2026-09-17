import { mkdir, copyFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function buildTarget(target) {
  const outdir = resolve(__dirname, `dist/${target}`);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  await esbuild.build({
    entryPoints: [
      resolve(__dirname, "src/background.ts"),
      resolve(__dirname, "src/popup.ts")
    ],
    outdir,
    bundle: true,
    format: "esm",
    target: "es2022",
    sourcemap: false,
    logLevel: "info"
  });

  const manifestName = target === "firefox" ? "manifest.firefox.json" : "manifest.chrome.json";
  await copyFile(resolve(__dirname, manifestName), resolve(outdir, "manifest.json"));
  await copyFile(resolve(__dirname, "src/popup.html"), resolve(outdir, "popup.html"));
  await copyFile(resolve(__dirname, "assets/icon16.png"), resolve(outdir, "icon16.png"));
  await copyFile(resolve(__dirname, "assets/icon32.png"), resolve(outdir, "icon32.png"));
  await copyFile(resolve(__dirname, "assets/icon48.png"), resolve(outdir, "icon48.png"));
  await copyFile(resolve(__dirname, "assets/icon128.png"), resolve(outdir, "icon128.png"));

  console.log(`Built extension for ${target} in ${outdir}`);
}

const arg = process.argv[2];
if (arg === "chrome" || arg === "firefox") {
  await buildTarget(arg);
} else if (arg === "all" || !arg) {
  await buildTarget("chrome");
  await buildTarget("firefox");
} else {
  console.error(`Unknown target: ${arg}. Expected "chrome", "firefox", or "all".`);
  process.exit(1);
}
