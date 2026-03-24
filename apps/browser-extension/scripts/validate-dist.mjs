import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..", "dist");
const requiredFiles = ["manifest.json", "background.js", "popup.js", "popup.html"];

for (const file of requiredFiles) {
  const fullPath = resolve(root, file);
  if (!existsSync(fullPath)) {
    throw new Error(`Extension build output is missing required file: ${file}`);
  }
}

const manifestPath = resolve(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error(`Expected manifest_version 3, got ${manifest.manifest_version}`);
}

const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
if (!permissions.includes("storage")) {
  throw new Error("Expected manifest permissions to include storage");
}

const hostPermissions = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [];
for (const pattern of hostPermissions) {
  if (!isValidChromeMatchPattern(pattern)) {
    throw new Error(`Invalid Chrome host permission pattern: ${pattern}`);
  }
}

if (hostPermissions.some((pattern) => pattern.includes("canvas.*"))) {
  throw new Error("Invalid host pattern found: canvas.*. Use *.canvaslms.com instead.");
}

console.log("Extension manifest and dist output validation passed.");

function isValidChromeMatchPattern(pattern) {
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
