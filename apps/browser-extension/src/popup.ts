const statusEl = document.querySelector<HTMLDivElement>("#status");
const syncBtn = document.querySelector<HTMLButtonElement>("#syncBtn");
const testBtn = document.querySelector<HTMLButtonElement>("#testBtn");
const portInput = document.querySelector<HTMLInputElement>("#port");
const apiTokenInput = document.querySelector<HTMLInputElement>("#apiToken");

if (!statusEl || !syncBtn || !testBtn || !portInput || !apiTokenInput) {
  throw new Error("Popup UI failed to initialize.");
}

const safeStatusEl = statusEl;
const safeSyncBtn = syncBtn;
const safeTestBtn = testBtn;
const safePortInput = portInput;
const safeApiTokenInput = apiTokenInput;

function requestStatus(url: string, method: "OPTIONS"): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("Network request failed."));
    xhr.send();
  });
}

void initializeForm();

safeApiTokenInput.addEventListener("change", async () => {
  const nextToken = safeApiTokenInput.value.trim();
  if (chrome.storage?.local) {
    await chrome.storage.local.set({ canvasApiToken: nextToken });
    return;
  }

  // Fallback for environments where storage API is unavailable.
  window.localStorage.setItem("canvasApiToken", nextToken);
});

safeSyncBtn.addEventListener("click", async () => {
  setStatus("Syncing Canvas course...", "");
  safeSyncBtn.disabled = true;

  try {
    const port = Number.parseInt(safePortInput.value, 10) || 27125;
    const apiToken = safeApiTokenInput.value.trim();
    const response = await chrome.runtime.sendMessage({
      type: "syncCanvasCourse",
      port,
      apiToken: apiToken || undefined
    });
    if (!response?.ok) {
      throw new Error(response?.message || "Sync failed.");
    }
    setStatus("Sync complete. Check Obsidian for updated files.", "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Sync failed.", "error");
  } finally {
    safeSyncBtn.disabled = false;
  }
});

safeTestBtn.addEventListener("click", async () => {
  setStatus("Testing Obsidian bridge connection...", "");
  safeTestBtn.disabled = true;

  try {
    const port = Number.parseInt(safePortInput.value, 10) || 27125;
    const status = await requestStatus(`http://127.0.0.1:${port}/canvas-sync`, "OPTIONS");

    if (status < 200 || (status >= 300 && status !== 204)) {
      throw new Error(`Bridge returned status ${status}.`);
    }

    setStatus("Bridge reachable on localhost.", "ok");
  } catch {
    setStatus("Could not reach bridge. Ensure Obsidian plugin is enabled.", "error");
  } finally {
    safeTestBtn.disabled = false;
  }
});

function setStatus(message: string, className: "" | "ok" | "error"): void {
  safeStatusEl.textContent = message;
  safeStatusEl.className = className;
}

async function initializeForm(): Promise<void> {
  let token = "";
  if (chrome.storage?.local) {
    const stored = await chrome.storage.local.get(["canvasApiToken"]);
    token = typeof stored.canvasApiToken === "string" ? stored.canvasApiToken : "";
  } else {
    token = window.localStorage.getItem("canvasApiToken") ?? "";
  }

  safeApiTokenInput.value = token;
}
