import { execSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function run(cmd, silent = false) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8", stdio: silent ? "pipe" : "inherit" });
  } catch (err) {
    if (silent) return null;
    throw err;
  }
}

function getGitOutput(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

function printHeader(title) {
  console.log(`\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

function checkVersions() {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  const versions = JSON.parse(readFileSync(resolve(root, "versions.json"), "utf8"));

  const pkgVersion = pkg.version;
  const manifestVersion = manifest.version;
  const hasVersionInVersionsJson = Boolean(versions[pkgVersion]);

  const matches = pkgVersion === manifestVersion && hasVersionInVersionsJson;
  return {
    pkgVersion,
    manifestVersion,
    hasVersionInVersionsJson,
    matches,
  };
}

function runStatus() {
  printHeader("RUNBOOK WORKFLOW STATUS");

  const branch = getGitOutput("git branch --show-current") || "DETACHED / UNKNOWN";
  const statusRaw = getGitOutput("git status --short");
  const isClean = statusRaw.length === 0;
  const versionInfo = checkVersions();

  console.log(`${colors.bold}Current Git Branch:${colors.reset} ${colors.yellow}${branch}${colors.reset}`);
  console.log(`${colors.bold}Working Tree:${colors.reset}       ${isClean ? colors.green + "Clean" : colors.red + "Uncommitted changes present"}${colors.reset}`);
  console.log(`${colors.bold}Package Version:${colors.reset}    ${versionInfo.pkgVersion}`);
  console.log(`${colors.bold}Manifest Version:${colors.reset}   ${versionInfo.manifestVersion} ${versionInfo.pkgVersion === versionInfo.manifestVersion ? colors.green + "✓" : colors.red + "✗ (Mismatch)"}${colors.reset}`);
  console.log(`${colors.bold}versions.json entry:${colors.reset}${versionInfo.hasVersionInVersionsJson ? colors.green + " ✓ Present" : colors.red + " ✗ Missing entry for " + versionInfo.pkgVersion}${colors.reset}`);

  // Determine which phase the user is currently at
  console.log(`\n${colors.bold}${colors.magenta}▶ Recommended Workflow Phase:${colors.reset}`);

  if (branch.startsWith("feature/") || branch.startsWith("fix/") || branch.startsWith("refactor/")) {
    console.log(`  ${colors.green}[Phase 1: Feature Branch Development]${colors.reset}`);
    console.log(`  • You are actively working on: ${colors.bold}${branch}${colors.reset}`);
    console.log(`  • When ready to verify, run:    ${colors.cyan}npm run check:all${colors.reset}`);
    console.log(`  • When checks pass, merge into develop:`);
    console.log(`      ${colors.dim}git checkout develop && git pull && git merge --no-ff ${branch}${colors.reset}`);
  } else if (branch === "develop") {
    console.log(`  ${colors.green}[Phase 2: Integration Testing & Repair]${colors.reset}`);
    console.log(`  • You are on the ${colors.bold}develop${colors.reset} integration branch.`);
    console.log(`  • Test in your local Obsidian test vault.`);
    console.log(`  • Next, proceed to ${colors.bold}Phase 3: Documentation & Screenshots${colors.reset}:`);
    console.log(`      - Update README.md and docs/`);
    console.log(`      - Update screenshots in docs/assets/ or docs/store-assets/`);
    console.log(`  • When tested and documented, merge to main:`);
    console.log(`      ${colors.dim}git checkout main && git pull && git merge --no-ff develop${colors.reset}`);
  } else if (branch === "main") {
    console.log(`  ${colors.green}[Phase 4: Release & Deployment]${colors.reset}`);
    console.log(`  • You are on ${colors.bold}main${colors.reset}.`);
    console.log(`  • To bump version & sync metadata:  ${colors.cyan}npm version patch|minor|major${colors.reset}`);
    console.log(`  • To verify release readiness:       ${colors.cyan}npm run release:check${colors.reset}`);
    console.log(`  • To deploy release tag:            ${colors.cyan}git push origin main --tags${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}[Custom / Maintenance Branch: ${branch}]${colors.reset}`);
    console.log(`  • Run ${colors.cyan}npm run check:all${colors.reset} to validate.`);
  }

  console.log(`\n${colors.dim}For complete runbook instructions, see: RUNBOOK.md${colors.reset}\n`);
}

function runCheckAll() {
  printHeader("RUNNING QUALITY & BUILD GATES (Phase 1 & 2 Check)");

  console.log(`${colors.bold}Step 1/4: Strict Linter (zero warnings)...${colors.reset}`);
  run("npm run lint");
  console.log(`${colors.green}✓ Lint passed.${colors.reset}\n`);

  console.log(`${colors.bold}Step 2/4: TypeScript Typecheck...${colors.reset}`);
  run("npm run typecheck");
  console.log(`${colors.green}✓ Typecheck passed.${colors.reset}\n`);

  console.log(`${colors.bold}Step 3/4: Unit Test Suite...${colors.reset}`);
  run("npm run test");
  console.log(`${colors.green}✓ All unit tests passed.${colors.reset}\n`);

  console.log(`${colors.bold}Step 4/4: Production Bundle Build...${colors.reset}`);
  run("npm run build");
  console.log(`${colors.green}✓ Production build succeeded.${colors.reset}\n`);

  console.log(`${colors.bold}${colors.green}🎉 ALL QUALITY GATES PASSED!${colors.reset}\n`);
}

function runReleaseCheck() {
  printHeader("VERIFYING RELEASE READINESS (Phase 4 Check)");

  const branch = getGitOutput("git branch --show-current");
  if (branch !== "main") {
    console.warn(`${colors.yellow}⚠️  Warning: Current branch is '${branch}', not 'main'. Standard releases should originate from 'main'.${colors.reset}\n`);
  }

  console.log(`${colors.bold}Checking version synchronization...${colors.reset}`);
  const versionInfo = checkVersions();
  if (!versionInfo.matches) {
    console.error(`${colors.red}✗ Version mismatch detected!${colors.reset}`);
    console.error(`  - package.json:  ${versionInfo.pkgVersion}`);
    console.error(`  - manifest.json: ${versionInfo.manifestVersion}`);
    console.error(`  - versions.json: ${versionInfo.hasVersionInVersionsJson ? "entry exists" : "MISSING entry"}`);
    console.error(`Run ${colors.cyan}npm run version:sync${colors.reset} to fix.\n`);
    process.exit(1);
  }
  console.log(`${colors.green}✓ Version ${versionInfo.pkgVersion} is consistent across package.json, manifest.json, and versions.json.${colors.reset}\n`);

  console.log(`${colors.bold}Checking release bundle assets...${colors.reset}`);
  const requiredFiles = ["manifest.json", "main.js", "styles.css"];
  for (const file of requiredFiles) {
    const filePath = resolve(root, file);
    if (!existsSync(filePath)) {
      console.error(`${colors.red}✗ Missing required release asset: ${file}${colors.reset}`);
      process.exit(1);
    }
    const stats = statSync(filePath);
    if (stats.size === 0) {
      console.error(`${colors.red}✗ Release asset is empty (0 bytes): ${file}${colors.reset}`);
      process.exit(1);
    }
    console.log(`  ✓ ${file} (${Math.round(stats.size / 1024)} KB)`);
  }

  console.log(`\n${colors.bold}Running full test and build verification suite...${colors.reset}`);
  runCheckAll();

  console.log(`${colors.bold}${colors.green}🚀 RELEASE READY!${colors.reset}`);
  console.log(`Next step to deploy:`);
  console.log(`  ${colors.cyan}git push origin main --tags${colors.reset}\n`);
}

const action = process.argv[2] || "status";

switch (action) {
  case "status":
    runStatus();
    break;
  case "check":
  case "check:all":
    runCheckAll();
    break;
  case "release-check":
  case "release:check":
    runReleaseCheck();
    break;
  default:
    console.log(`Unknown command: ${action}`);
    console.log(`Available commands: status | check | release-check`);
    process.exit(1);
}
