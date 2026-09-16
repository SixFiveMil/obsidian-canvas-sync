import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, "..");
const repoRoot = resolve(extensionRoot, "../..");

async function publishChrome(zipPath, options = {}) {
  const extensionId = process.env.CHROME_EXTENSION_ID;
  const clientId = process.env.CHROME_CLIENT_ID;
  const clientSecret = process.env.CHROME_CLIENT_SECRET;
  const refreshToken = process.env.CHROME_REFRESH_TOKEN;

  if (!extensionId || !clientId || !clientSecret || !refreshToken) {
    console.log("[CWS] Skipping Chrome Web Store publishing (CHROME_EXTENSION_ID, CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, or CHROME_REFRESH_TOKEN not set).");
    return { skipped: true };
  }

  if (!existsSync(zipPath)) {
    throw new Error(`[CWS] Chrome zip package not found at: ${zipPath}`);
  }

  console.log(`[CWS] Authenticating with Chrome Web Store API for extension ID: ${extensionId}...`);

  // Step 1: Obtain access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`[CWS] Failed to fetch access token: ${JSON.stringify(tokenData)}`);
  }

  const accessToken = tokenData.access_token;
  console.log("[CWS] Access token obtained. Uploading extension package...");

  // Step 2: Upload package
  const zipBuffer = readFileSync(zipPath);
  const uploadRes = await fetch(`https://www.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "x-goog-api-version": "2"
    },
    body: zipBuffer
  });

  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(`[CWS] Package upload failed: ${JSON.stringify(uploadData)}`);
  }

  console.log(`[CWS] Package uploaded successfully: status=${uploadData.uploadState || "SUCCESS"}`);

  // Step 3: Publish / Submit for review if requested
  if (options.publish || process.env.CWS_PUBLISH === "true") {
    console.log("[CWS] Submitting package for review...");
    const publishRes = await fetch(`https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "x-goog-api-version": "2"
      }
    });

    const publishData = await publishRes.json();
    if (!publishRes.ok) {
      throw new Error(`[CWS] Publishing failed: ${JSON.stringify(publishData)}`);
    }

    console.log(`[CWS] Published successfully: status=${JSON.stringify(publishData.status || publishData)}`);
  } else {
    console.log("[CWS] Package uploaded as draft (pass --publish or set CWS_PUBLISH=true to publish/submit for review).");
  }

  return { skipped: false, success: true };
}

async function publishFirefox(options = {}) {
  const apiKey = process.env.WEB_EXT_API_KEY || process.env.AMO_JWT_ISSUER;
  const apiSecret = process.env.WEB_EXT_API_SECRET || process.env.AMO_JWT_SECRET;

  if (!apiKey || !apiSecret) {
    console.log("[AMO] Skipping Mozilla Add-ons signing/publishing (WEB_EXT_API_KEY or WEB_EXT_API_SECRET not set).");
    return { skipped: true };
  }

  const sourceDir = resolve(extensionRoot, "dist/firefox");
  const artifactsDir = resolve(extensionRoot, "dist/firefox-signed");
  const channel = options.channel || process.env.AMO_CHANNEL || "listed";

  if (!existsSync(sourceDir)) {
    throw new Error(`[AMO] Firefox dist directory not found at: ${sourceDir}. Run build:firefox first.`);
  }

  console.log(`[AMO] Signing/publishing Firefox extension with channel '${channel}'...`);

  const cmd = `npx web-ext sign --source-dir "${sourceDir}" --artifacts-dir "${artifactsDir}" --api-key="${apiKey}" --api-secret="${apiSecret}" --channel="${channel}" --overwrite-dest`;
  execSync(cmd, { stdio: "inherit", cwd: extensionRoot });

  console.log(`[AMO] Firefox extension signed/published in ${artifactsDir}`);
  return { skipped: false, success: true };
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find(a => ["chrome", "firefox", "all"].includes(a)) || "all";
  const publishFlag = args.includes("--publish");
  const channelArg = args.find(a => a.startsWith("--channel="))?.split("=")[1] || "listed";

  // Locate Chrome zip
  const manifest = JSON.parse(readFileSync(resolve(extensionRoot, "manifest.chrome.json"), "utf8"));
  const version = process.env.RELEASE_TAG || manifest.version || "0.2.1";
  const chromeZipPath = resolve(repoRoot, `release/canvas-to-obsidian-sync-chrome-${version}.zip`);

  if (target === "chrome" || target === "all") {
    await publishChrome(chromeZipPath, { publish: publishFlag });
  }

  if (target === "firefox" || target === "all") {
    await publishFirefox({ channel: channelArg });
  }
}

main().catch((err) => {
  console.error("[PUBLISH ERROR]", err.message);
  process.exit(1);
});

