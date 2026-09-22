/**
 * @module bridge/bridge-server
 * @description Local HTTP bridge listener that accepts Canvas course payloads from
 * companion browser extensions (Chrome, Firefox, Chromium).
 *
 * Designed to run exclusively on Desktop platforms with strict origin verification,
 * request header authentication, and payload size bounds.
 */

import { Notice, Platform } from "obsidian";
import { BRIDGE_PAIRING_HEADER, TRUSTED_CLIENT_HEADER } from "../constants";
import { isAllowedOrigin, validateEnvelopeShape } from "../utils";
import type { CanvasCoursePayload, CanvasSyncSettings, CourseSyncResult } from "../types";

type HttpServer = import("http").Server;
type HttpIncomingMessage = import("http").IncomingMessage;
type HttpServerResponse = import("http").ServerResponse;

/**
 * Handler callback invoked when a valid CanvasCoursePayload is received over the bridge.
 */
export type BridgePayloadHandler = (
  payload: CanvasCoursePayload,
  source: "browser-extension"
) => Promise<CourseSyncResult>;

/**
 * Manages the optional local HTTP server for the browser extension bridge.
 */
export class CanvasBridgeServer {
  private server: HttpServer | null = null;
  private settings: CanvasSyncSettings;
  private onPayload: BridgePayloadHandler;

  /**
   * Creates a new CanvasBridgeServer instance.
   *
   * @param settings - The current plugin settings.
   * @param onPayload - Callback to execute when a course payload is accepted.
   */
  constructor(settings: CanvasSyncSettings, onPayload: BridgePayloadHandler) {
    this.settings = settings;
    this.onPayload = onPayload;
  }

  /**
   * Updates settings references used by the server (e.g. port configuration).
   *
   * @param settings - The updated plugin settings.
   */
  public updateSettings(settings: CanvasSyncSettings): void {
    this.settings = settings;
  }

  /**
   * Safely imports Node's `http` module via Electron/Node runtime on desktop platforms only.
   *
   * @returns The Node http module or null if unsupported (e.g. on mobile).
   */
  private getHttpModule(): typeof import("http") | null {
    if (Platform.isMobile || !Platform.isDesktop) {
      return null;
    }
    try {
      const nodeRequire = (window as unknown as { require?: (moduleName: string) => typeof import("http") }).require;
      if (typeof nodeRequire === "function") {
        return nodeRequire("http");
      }
    } catch {
      // Platform fallback
    }
    return null;
  }

  /**
   * Indicates whether the bridge server is currently running and bound to a port.
   */
  public isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Starts the local bridge HTTP listener if enabled and running on desktop.
   */
  public async start(): Promise<void> {
    if (Platform.isMobile || !Platform.isDesktop) {
      return;
    }
    if (this.server) {
      return;
    }

    const http = this.getHttpModule();
    if (!http) {
      new Notice("Canvas sync bridge: HTTP module unavailable on this platform.");
      return;
    }

    try {
      this.server = http.createServer((req, res) => {
        void this.handleBridgeRequest(req, res);
      });
    } catch (err) {
      new Notice(`Canvas sync bridge: Failed to initialize listener: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    return new Promise<void>((resolve) => {
      this.server?.once("error", (err: Error) => {
        new Notice(`Canvas Sync Bridge: Failed to bind port ${this.settings.listenPort}: ${err.message}`);
        this.server = null;
        resolve();
      });
      this.server?.listen(this.settings.listenPort, "127.0.0.1", () => {
        resolve();
      });
    });
  }

  /**
   * Stops the local bridge HTTP listener if active.
   */
  public async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const current = this.server;
    this.server = null;

    return new Promise<void>((resolve) => {
      current.close(() => {
        resolve();
      });
    });
  }

  /**
   * Restarts the bridge listener to apply configuration changes (e.g. port or enable/disable).
   */
  public async restart(): Promise<void> {
    await this.stop();
    if (this.settings.enableBridgeServer && !Platform.isMobile) {
      await this.start();
    }
  }

  /**
   * Dispatches incoming HTTP requests, performing CORS pre-flight, origin validation,
   * client header verification, body accumulation with size bounds, and payload ingestion.
   */
  private async handleBridgeRequest(req: HttpIncomingMessage, res: HttpServerResponse): Promise<void> {
    const originHeader = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
    const allowed = isAllowedOrigin(originHeader);

    if (!allowed) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Origin not allowed." }));
      return;
    }

    const corsOrigin = originHeader && isAllowedOrigin(originHeader) ? originHeader : "*";

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "Content-Type, X-Canvas-Sync-Client, X-Canvas-Bridge-Token, Authorization",
        "Vary": "Origin"
      });
      res.end();
      return;
    }

    // Health check endpoint
    if (req.method === "GET" && (req.url === "/health" || req.url === "/status")) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin
      });
      res.end(JSON.stringify({ ok: true, status: "healthy", plugin: "canvas-sync-bridge" }));
      return;
    }

    // Only allow POST to sync endpoints
    if (req.method !== "POST" || (req.url !== "/canvas-sync" && req.url !== "/sync")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Not found" }));
      return;
    }

    // Validate trusted client header
    const clientHeaderRaw = req.headers[TRUSTED_CLIENT_HEADER];
    const clientHeader = (typeof clientHeaderRaw === "string" ? clientHeaderRaw : undefined)?.toLowerCase();
    if (clientHeader !== "canvas-browser-extension" && clientHeader !== "canvas-to-obsidian-sync") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Untrusted client header." }));
      return;
    }

    // Validate optional bridge pairing token if configured
    const configuredToken = this.settings.bridgePairingToken ? this.settings.bridgePairingToken.trim() : "";
    if (configuredToken) {
      const rawHeaderToken = req.headers[BRIDGE_PAIRING_HEADER];
      const headerToken = typeof rawHeaderToken === "string" ? rawHeaderToken.trim() : undefined;

      const rawAuthHeader = req.headers["authorization"];
      const authHeaderStr = typeof rawAuthHeader === "string" ? rawAuthHeader.trim() : undefined;
      let authBearerToken: string | undefined;
      if (authHeaderStr) {
        if (authHeaderStr.startsWith("Bearer ") || authHeaderStr.startsWith("bearer ")) {
          authBearerToken = authHeaderStr.slice(7).trim();
        } else {
          authBearerToken = authHeaderStr;
        }
      }

      const providedToken = headerToken || authBearerToken;

      if (!providedToken || providedToken !== configuredToken) {
        res.writeHead(401, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin
        });
        res.end(JSON.stringify({ ok: false, message: "Unauthorized: Invalid or missing bridge pairing token." }));
        new Notice("Canvas sync bridge: Unauthorized request blocked (invalid or missing pairing token).");
        return;
      }
    }

    // Accumulate payload body with 50MB safety limit
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      raw += chunk;
      if (raw.length > 50 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on("end", () => {
      void (async () => {
        try {
          const envelope: unknown = JSON.parse(raw);
          validateEnvelopeShape(envelope);
          const payload = (envelope as { payload: CanvasCoursePayload }).payload;
          const result = await this.onPayload(payload, "browser-extension");
          const actionText = result.isNew ? "Created course" : "Updated course";
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": corsOrigin
          });
          res.end(JSON.stringify({ ok: true, message: `${actionText}: ${payload.courseName}` }));
          new Notice(`Canvas Sync: ${actionText} "${payload.courseName}" from browser extension!`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": corsOrigin
          });
          res.end(JSON.stringify({ ok: false, message: msg }));
          new Notice(`Canvas Sync error: ${msg}`);
        }
      })();
    });
  }
}
