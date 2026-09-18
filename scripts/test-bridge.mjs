#!/usr/bin/env node

/**
 * Obsidian Canvas Sync - Bridge Listener Diagnostics Script
 *
 * Verifies that the Obsidian plugin HTTP bridge is up, running, and accepting requests.
 * Usage:
 *   node scripts/test-bridge.mjs [port]
 *   npm run test:bridge
 */

const portArg = process.argv.find((arg) => /^\d+$/.test(arg)) || process.env.CANVAS_SYNC_PORT || "27125";
const port = Number.parseInt(portArg, 10);
const host = "127.0.0.1";
const baseUrl = `http://${host}:${port}`;

console.log(`\n======================================================`);
console.log(`  Obsidian Canvas Sync Bridge Listener Diagnostic`);
console.log(`  Target: ${baseUrl}`);
console.log(`======================================================\n`);

async function runDiagnostics() {
  let passedTests = 0;
  const totalTests = 2;

  // Test 1: GET /health
  console.log(`[1/${totalTests}] Testing GET /health endpoint...`);
  try {
    const healthRes = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (healthRes.ok) {
      const data = await healthRes.json().catch(() => ({}));
      console.log(`    ✅ Status: HTTP ${healthRes.status} OK`);
      console.log(`    ✅ Response:`, JSON.stringify(data));
      passedTests++;
    } else {
      console.log(`    ⚠️  HTTP ${healthRes.status} returned from /health`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`    ❌ Failed to connect to ${baseUrl}/health: ${errorMsg}`);
  }

  // Test 2: OPTIONS /canvas-sync (CORS preflight)
  console.log(`\n[2/${totalTests}] Testing OPTIONS /canvas-sync (CORS preflight)...`);
  try {
    const optionsRes = await fetch(`${baseUrl}/canvas-sync`, {
      method: "OPTIONS",
      headers: {
        "Origin": "chrome-extension://diagnostic-test-runner",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, X-Canvas-Sync-Client"
      }
    });

    if (optionsRes.status === 204 || optionsRes.ok) {
      console.log(`    ✅ Status: HTTP ${optionsRes.status}`);
      console.log(`    ✅ Access-Control-Allow-Origin: ${optionsRes.headers.get("access-control-allow-origin") || "none"}`);
      console.log(`    ✅ Access-Control-Allow-Methods: ${optionsRes.headers.get("access-control-allow-methods") || "none"}`);
      passedTests++;
    } else {
      console.log(`    ⚠️  HTTP ${optionsRes.status} returned from OPTIONS /canvas-sync`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`    ❌ Failed OPTIONS preflight to ${baseUrl}/canvas-sync: ${errorMsg}`);
  }

  // Summary
  console.log(`\n------------------------------------------------------`);
  if (passedTests === totalTests) {
    console.log(`🎉 SUCCESS: Canvas Sync Bridge is active and listening on port ${port}!\n`);
    process.exit(0);
  } else if (passedTests > 0) {
    console.log(`⚠️  PARTIAL: Bridge is responding, but some endpoints had unexpected responses.\n`);
    process.exit(1);
  } else {
    console.log(`❌ FAILED: Bridge listener is not reachable on ${baseUrl}.\n`);
    console.log(`Troubleshooting Steps:`);
    console.log(` 1. Ensure Obsidian is open on your computer.`);
    console.log(` 2. In Obsidian Settings > Community Plugins, verify "Canvas Sync Bridge" is enabled.`);
    console.log(` 3. In Obsidian Settings > Canvas Sync Bridge, verify "Enable Browser Bridge" is toggled ON.`);
    console.log(` 4. Verify the port in settings matches (${port}).`);
    console.log(` 5. In Obsidian, open Command Palette (Ctrl+P / Cmd+P) and run:`);
    console.log(`    "Canvas Sync: Restart browser bridge listener"`);
    console.log(`------------------------------------------------------\n`);
    process.exit(1);
  }
}

void runDiagnostics();
