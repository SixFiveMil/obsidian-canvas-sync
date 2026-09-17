import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, "..");
const repoRoot = resolve(extensionRoot, "../..");

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = readdirSync(dirPath);
  for (const file of files) {
    const fullPath = join(dirPath, file);
    if (statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

function calculateSha256(filePath) {
  const fileBuffer = readFileSync(filePath);
  const hashSum = createHash("sha256");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

async function packageTarget(target, outDir, customVersion) {
  const sourceDir = resolve(extensionRoot, `dist/${target}`);
  if (!existsSync(sourceDir)) {
    throw new Error(`Build directory does not exist: ${sourceDir}. Run build first.`);
  }

  const manifestPath = resolve(sourceDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest.json missing in ${sourceDir}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const version = customVersion || manifest.version || "0.0.0";
  const zipFileName = `canvas-to-obsidian-sync-${target}-${version}.zip`;
  const zipFilePath = resolve(outDir, zipFileName);

  mkdirSync(outDir, { recursive: true });

  const zip = new JSZip();
  const allFiles = getAllFiles(sourceDir);

  for (const file of allFiles) {
    const relativePath = relative(sourceDir, file).replace(/\\/g, "/");
    const content = readFileSync(file);
    zip.file(relativePath, content);
  }

  const zipContent = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });

  writeFileSync(zipFilePath, zipContent);

  const stats = statSync(zipFilePath);
  const hash = calculateSha256(zipFilePath);

  console.log(`[PACKAGE] Created ${zipFileName}`);
  console.log(`  Path: ${zipFilePath}`);
  console.log(`  Size: ${stats.size} bytes`);
  console.log(`  SHA-256: ${hash}`);

  return {
    target,
    version,
    fileName: zipFileName,
    filePath: zipFilePath,
    size: stats.size,
    sha256: hash
  };
}

async function main() {
  const args = process.argv.slice(2);
  let target = "all";
  let outDir = resolve(repoRoot, "release");
  let version = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--chrome" || arg === "chrome") {
      target = "chrome";
    } else if (arg === "--firefox" || arg === "firefox") {
      target = "firefox";
    } else if (arg === "--all" || arg === "all") {
      target = "all";
    } else if (arg === "--out-dir" || arg === "-o") {
      outDir = resolve(process.cwd(), args[++i]);
    } else if (arg === "--version" || arg === "-v") {
      version = args[++i];
    }
  }

  const results = [];
  if (target === "chrome" || target === "all") {
    results.push(await packageTarget("chrome", outDir, version));
  }
  if (target === "firefox" || target === "all") {
    results.push(await packageTarget("firefox", outDir, version));
  }

  // Generate or append to checksums.txt in output directory
  const checksumsPath = resolve(outDir, "checksums.txt");
  let existingChecksums = "";
  if (existsSync(checksumsPath)) {
    existingChecksums = readFileSync(checksumsPath, "utf8");
  }

  const checksumLines = new Map();
  if (existingChecksums.trim()) {
    for (const line of existingChecksums.split(/\r?\n/)) {
      if (line.trim()) {
        const [hash, file] = line.trim().split(/\s+/);
        if (hash && file) {
          checksumLines.set(file, hash);
        }
      }
    }
  }

  for (const res of results) {
    checksumLines.set(res.fileName, res.sha256);
  }

  const checksumOutput = Array.from(checksumLines.entries())
    .map(([file, hash]) => `${hash}  ${file}`)
    .join("\n") + "\n";

  writeFileSync(checksumsPath, checksumOutput, "utf8");
  console.log(`[PACKAGE] Updated checksums at ${checksumsPath}`);
}

main().catch((err) => {
  console.error("[PACKAGE ERROR]", err.message);
  process.exit(1);
});

