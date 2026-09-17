import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDir, "..");

function validateDirectory(targetDir, targetName) {
  const root = resolve(extensionRoot, targetDir);
  if (!existsSync(root)) {
    throw new Error(`Directory does not exist: ${root}`);
  }

  const requiredFiles = [
    "manifest.json",
    "background.js",
    "popup.js",
    "popup.html",
    "icon16.png",
    "icon32.png",
    "icon48.png",
    "icon128.png"
  ];

  for (const file of requiredFiles) {
    const fullPath = resolve(root, file);
    if (!existsSync(fullPath)) {
      throw new Error(`Extension [${targetName}] build output is missing required file: ${file}`);
    }
  }

  const manifestPath = resolve(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (manifest.manifest_version !== 3) {
    throw new Error(`[${targetName}] Expected manifest_version 3, got ${manifest.manifest_version}`);
  }

  if (!manifest.name || typeof manifest.name !== "string") {
    throw new Error(`[${targetName}] Manifest is missing 'name'`);
  }

  if (!manifest.version || typeof manifest.version !== "string") {
    throw new Error(`[${targetName}] Manifest is missing 'version'`);
  }

  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  if (!permissions.includes("storage")) {
    throw new Error(`[${targetName}] Expected manifest permissions to include 'storage'`);
  }

  const hostPermissions = [
    ...(Array.isArray(manifest.host_permissions) ? manifest.host_permissions : []),
    ...(Array.isArray(manifest.optional_host_permissions) ? manifest.optional_host_permissions : [])
  ];
  for (const pattern of hostPermissions) {
    if (!isValidMatchPattern(pattern)) {
      throw new Error(`[${targetName}] Invalid host permission pattern: ${pattern}`);
    }
  }

  if (hostPermissions.some((pattern) => pattern.includes("canvas.*"))) {
    throw new Error(`[${targetName}] Invalid host pattern found: canvas.*. Use *.canvaslms.com instead.`);
  }

  if (targetName === "firefox" || root.includes("firefox")) {
    if (!manifest.browser_specific_settings?.gecko?.id) {
      throw new Error(`[${targetName}] Firefox manifest missing browser_specific_settings.gecko.id`);
    }
    if (!manifest.background?.scripts && !manifest.background?.service_worker) {
      throw new Error(`[${targetName}] Firefox manifest missing background.scripts`);
    }
  } else if (targetName === "chrome" || root.includes("chrome")) {
    if (!manifest.background?.service_worker) {
      throw new Error(`[${targetName}] Chrome manifest missing background.service_worker`);
    }
  }

  console.log(`Extension [${targetName}] manifest and dist output validation passed (${root}).`);
}

function isValidMatchPattern(pattern) {
  if (typeof pattern !== "string") {
    return false;
  }

  if (pattern === "<all_urls>") {
    return true;
  }

  const match = pattern.match(/^(\*|http|https|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]*)(\/.*)$/);
  if (!match) {
    return false;
  }

  const [, scheme, host, path] = match;
  if (!path.startsWith("/")) {
    return false;
  }

  if (scheme === "file") {
    return host === "";
  }

  return host.length > 0;
}

const inputArg = process.argv[2];
if (!inputArg || inputArg === "all") {
  const chromeDist = resolve(extensionRoot, "dist/chrome");
  const firefoxDist = resolve(extensionRoot, "dist/firefox");

  if (existsSync(chromeDist)) {
    validateDirectory("dist/chrome", "chrome");
  }
  if (existsSync(firefoxDist)) {
    validateDirectory("dist/firefox", "firefox");
  }
  if (!existsSync(chromeDist) && !existsSync(firefoxDist)) {
    throw new Error("No build outputs found in dist/chrome or dist/firefox to validate.");
  }
} else if (inputArg === "chrome") {
  validateDirectory("dist/chrome", "chrome");
} else if (inputArg === "firefox") {
  validateDirectory("dist/firefox", "firefox");
} else {
  // Custom path passed
  validateDirectory(inputArg, inputArg.includes("firefox") ? "firefox" : "chrome");
}
