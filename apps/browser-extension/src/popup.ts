declare const browser: {
  permissions?: {
    contains?: (permissions: { origins: string[] }) => Promise<boolean>;
    request?: (permissions: { origins: string[] }) => Promise<boolean>;
  };
} | undefined;

const statusEl = document.querySelector<HTMLDivElement>("#status");
const syncBtn = document.querySelector<HTMLButtonElement>("#syncBtn");
const testBtn = document.querySelector<HTMLButtonElement>("#testBtn");
const portInput = document.querySelector<HTMLInputElement>("#port");
const apiTokenInput = document.querySelector<HTMLInputElement>("#apiToken");
const courseCodeInput = document.querySelector<HTMLInputElement>("#courseCode");
const courseNameInput = document.querySelector<HTMLInputElement>("#courseName");

if (!statusEl || !syncBtn || !testBtn || !portInput || !apiTokenInput || !courseCodeInput || !courseNameInput) {
  throw new Error("Popup UI failed to initialize.");
}

const safeStatusEl = statusEl;
const safeSyncBtn = syncBtn;
const safeTestBtn = testBtn;
const safePortInput = portInput;
const safeApiTokenInput = apiTokenInput;
const safeCourseCodeInput = courseCodeInput;
const safeCourseNameInput = courseNameInput;

async function requestStatus(url: string, method: "OPTIONS"): Promise<number> {
  try {
    const response = await fetch(url, { method });
    return response.status;
  } catch {
    throw new Error("Network request failed.");
  }
}

async function ensureBridgePermission(): Promise<boolean> {
  const origins = ["http://127.0.0.1/*", "http://localhost/*"];
  const browserPermissions = typeof browser !== "undefined" ? browser?.permissions : undefined;
  const permissionsApi = chrome.permissions ?? browserPermissions;

  if (!permissionsApi) {
    return true;
  }

  try {
    const has = await permissionsApi.contains?.({ origins }).catch(() => false);
    if (has) {
      return true;
    }

    const granted = await permissionsApi.request?.({ origins }).catch(() => false);
    return !!granted;
  } catch {
    return false;
  }
}

interface SyncProgressMessage {
  type: "syncProgress";
  current: number;
  total: number;
  filename: string;
}

chrome.runtime.onMessage.addListener((rawMessage: unknown) => {
  if (
    typeof rawMessage === "object" &&
    rawMessage !== null &&
    (rawMessage as { type?: string }).type === "syncProgress"
  ) {
    const msg = rawMessage as SyncProgressMessage;
    setStatus(`Downloading asset ${msg.current}/${msg.total}: ${msg.filename}`, "");
  }
});

void initializeForm();

interface SyncResponse {
  ok?: boolean;
  message?: string;
}

interface DetectCourseResponse {
  ok?: boolean;
  courseCode?: string;
  courseName?: string;
  message?: string;
}

safeApiTokenInput.addEventListener("change", () => {
  void (async () => {
    const nextToken = safeApiTokenInput.value.trim();
    if (chrome.storage?.local) {
      await chrome.storage.local.set({ canvasApiToken: nextToken });
      return;
    }

    // Fallback for environments where storage API is unavailable.
    window.localStorage.setItem("canvasApiToken", nextToken);
  })();
});

safeSyncBtn.addEventListener("click", () => {
  void (async () => {
    setStatus("Syncing Canvas course...", "");
    safeSyncBtn.disabled = true;

    try {
      const granted = await ensureBridgePermission();
      if (!granted) {
        setStatus("Firefox blocked localhost access. Please allow the extension to access http://127.0.0.1 and reload the extension, then try again.", "error");
        return;
      }

      const port = Number.parseInt(safePortInput.value, 10) || 27125;
      const apiToken = safeApiTokenInput.value.trim();
      const courseCode = safeCourseCodeInput.value.trim();
      const courseName = safeCourseNameInput.value.trim();

      let tabId: number | undefined;
      if (chrome.tabs?.query) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = activeTab?.id;
      }

      const response = await chrome.runtime.sendMessage<unknown, SyncResponse | undefined>({
        type: "syncCanvasCourse",
        port,
        apiToken: apiToken || undefined,
        courseCode: courseCode || undefined,
        courseName: courseName || undefined,
        tabId
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
  })();
});

safeTestBtn.addEventListener("click", () => {
  void (async () => {
    setStatus("Testing Obsidian bridge connection...", "");
    safeTestBtn.disabled = true;

    try {
      const granted = await ensureBridgePermission();
      if (!granted) {
        setStatus("Firefox blocked localhost access. Please allow the extension to access http://127.0.0.1 and reload the extension, then try again.", "error");
        return;
      }

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
  })();
});

function setStatus(message: string, className: "" | "ok" | "error"): void {
  safeStatusEl.textContent = message;
  safeStatusEl.className = className;
}

async function initializeForm(): Promise<void> {
  let token = "";
  if (chrome.storage?.local) {
    const stored = await chrome.storage.local.get<{ canvasApiToken?: unknown }>(["canvasApiToken"]);
    token = typeof stored.canvasApiToken === "string" ? stored.canvasApiToken : "";
  } else {
    token = window.localStorage.getItem("canvasApiToken") ?? "";
  }

  safeApiTokenInput.value = token;

  try {
    let tabId: number | undefined;
    if (chrome.tabs?.query) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = activeTab?.id;
    }

    const response = await chrome.runtime.sendMessage<unknown, DetectCourseResponse | undefined>({
      type: "detectCourseInfo",
      apiToken: token || undefined,
      tabId
    });
    if (response?.ok) {
      if (response.courseCode) {
        safeCourseCodeInput.value = response.courseCode;
      }
      if (response.courseName) {
        safeCourseNameInput.value = response.courseName;
      }
      setStatus(`Detected: ${response.courseCode ? `[${response.courseCode}] ` : ""}${response.courseName ?? ""}`, "ok");
    } else {
      setStatus("Open a Canvas course tab to auto-detect course info.", "");
    }
  } catch {
    setStatus("Open a Canvas course tab to auto-detect course info.", "");
  }
}
