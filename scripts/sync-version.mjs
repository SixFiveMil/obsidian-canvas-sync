import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = process.env.npm_package_version || pkg.version;

if (!version) {
  console.error("[SYNC-VERSION ERROR] Could not determine target version.");
  process.exit(1);
}

const manifestPath = resolve(root, "manifest.json");
const versionsPath = resolve(root, "versions.json");
const updatedFiles = [];

if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let manifestUpdated = false;
  if (manifest.version !== version) {
    manifest.version = version;
    manifestUpdated = true;
  }
  const minAppVersion = manifest.minAppVersion || "1.5.0";

  if (manifestUpdated) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`[SYNC-VERSION] Updated manifest.json -> ${version}`);
    updatedFiles.push("manifest.json");
  } else {
    console.log(`[SYNC-VERSION] manifest.json is already version ${version}`);
  }

  if (existsSync(versionsPath)) {
    const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
    if (versions[version] !== minAppVersion) {
      const newVersions = { [version]: minAppVersion, ...versions };
      writeFileSync(versionsPath, JSON.stringify(newVersions, null, 2) + "\n", "utf8");
      console.log(`[SYNC-VERSION] Updated versions.json with ${version}: ${minAppVersion}`);
      updatedFiles.push("versions.json");
    } else {
      console.log(`[SYNC-VERSION] versions.json already contains ${version}`);
    }
  }
}

// Stage updated manifest and versions.json if executed within git / npm version
if (updatedFiles.length > 0) {
  try {
    execSync(`git add ${updatedFiles.join(" ")}`, { cwd: root, stdio: "ignore" });
  } catch {
    // ignore if not in a git working tree
  }
}
