import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { CanvasBridgeServer } from "../src/bridge";
import { BRIDGE_PAIRING_HEADER, DEFAULT_SETTINGS, TRUSTED_CLIENT_HEADER } from "../src/constants";
import type { CanvasCoursePayload, CanvasSyncEnvelope, CanvasSyncSettings, CourseSyncResult } from "../src/types";
import { validateEnvelopeShape } from "../src/utils";

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (code: number, headers?: Record<string, string>) => MockResponse;
  end: (data?: string) => void;
}

function createMockBridgeRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
}) {
  const req = new EventEmitter() as any;
  req.method = options.method || "POST";
  req.url = options.url || "/canvas-sync";
  req.headers = {
    origin: "chrome-extension://abcdefghijklmnopqrstuvwxyz123456",
    [TRUSTED_CLIENT_HEADER]: "canvas-browser-extension",
    ...options.headers
  };
  req.setEncoding = vi.fn();

  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(code: number, headers?: Record<string, string>) {
      res.statusCode = code;
      if (headers) {
        res.headers = { ...res.headers, ...headers };
      }
      return res;
    },
    end(data?: string) {
      if (data) res.body = data;
    }
  };

  const execute = async (server: CanvasBridgeServer) => {
    const handlePromise = (server as any).handleBridgeRequest(req, res);
    if (req.method === "POST" && options.body !== undefined) {
      req.emit("data", options.body);
    }
    req.emit("end");
    await handlePromise;
    // Allow any asynchronous microtasks in on('end') to settle
    await new Promise((resolve) => setTimeout(resolve, 10));
    return res;
  };

  return { req, res, execute };
}

describe("CanvasSyncEnvelope bridge protocol v1 compatibility", () => {
  it("validates well-formed v1 envelope structure without announcements (legacy backwards-compatibility)", () => {
    const sampleEnvelope: CanvasSyncEnvelope = {
      source: "canvas-browser-extension",
      version: "1",
      payload: {
        courseId: "9876",
        courseName: "Biology 101",
        courseCode: "BIO101",
        fetchedAt: new Date().toISOString(),
        modules: [
          {
            id: "1",
            name: "Week 1: Cell Structure",
            position: 1,
            items: [
              {
                id: "10",
                title: "Readings",
                type: "WikiPage",
                position: 1,
                pageSlug: "cell-structure"
              }
            ]
          }
        ],
        pages: [],
        assignments: [
          {
            id: "50",
            name: "Lab Report 1",
            pointsPossible: 25,
            dueAt: "2026-10-15T23:59:00Z"
          }
        ],
        discussions: [],
        events: []
      }
    };

    expect(sampleEnvelope.version).toBe("1");
    expect(sampleEnvelope.source).toBe("canvas-browser-extension");
    expect(sampleEnvelope.payload.courseId).toBe("9876");
    expect(sampleEnvelope.payload.modules).toHaveLength(1);
    expect(sampleEnvelope.payload.assignments).toHaveLength(1);
    expect(sampleEnvelope.payload.announcements).toBeUndefined();

    expect(() => validateEnvelopeShape(sampleEnvelope)).not.toThrow();
  });

  it("validates modern v1 envelope structure with announcements field", () => {
    const modernEnvelope: CanvasSyncEnvelope = {
      source: "canvas-browser-extension",
      version: "1",
      payload: {
        courseId: "9876",
        courseName: "Biology 101",
        courseCode: "BIO101",
        fetchedAt: new Date().toISOString(),
        modules: [],
        pages: [],
        assignments: [],
        discussions: [],
        announcements: [
          {
            id: "777",
            title: "Exam 1 Details",
            postedAt: "2026-10-01T12:00:00Z",
            author: "Dr. Darwin",
            messageHtml: "<p>Exam 1 covers chapters 1-4.</p>"
          }
        ],
        events: []
      }
    };

    expect(modernEnvelope.payload.announcements).toBeDefined();
    expect(modernEnvelope.payload.announcements).toHaveLength(1);
    expect(modernEnvelope.payload.announcements![0].title).toBe("Exam 1 Details");

    expect(() => validateEnvelopeShape(modernEnvelope)).not.toThrow();
  });
});

describe("Bridge Pairing Token Authentication & Backwards Compatibility", () => {
  const samplePayload: CanvasCoursePayload = {
    courseId: "101",
    courseName: "Intro to Computer Science",
    fetchedAt: new Date().toISOString(),
    modules: [],
    pages: [],
    assignments: [],
    discussions: [],
    events: []
  };

  const sampleEnvelope: CanvasSyncEnvelope = {
    source: "canvas-browser-extension",
    version: "1",
    payload: samplePayload
  };

  const validBody = JSON.stringify(sampleEnvelope);

  it("exports correct BRIDGE_PAIRING_HEADER and sets default pairing token to empty string", () => {
    expect(BRIDGE_PAIRING_HEADER).toBe("x-canvas-bridge-token");
    expect(DEFAULT_SETTINGS.bridgePairingToken).toBe("");
  });

  it("allows requests without token when pairing token is empty (default backwards compatibility)", async () => {
    const mockHandler = vi.fn().mockResolvedValue({ isNew: true, courseFolder: "Canvas/CS101" } as CourseSyncResult);
    const settings: CanvasSyncSettings = { ...DEFAULT_SETTINGS, bridgePairingToken: "" };
    const server = new CanvasBridgeServer(settings, mockHandler);

    const { execute } = createMockBridgeRequest({
      method: "POST",
      url: "/canvas-sync",
      body: validBody
    });

    const res = await execute(server);

    expect(res.statusCode).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(1);
    const responseData = JSON.parse(res.body);
    expect(responseData.ok).toBe(true);
    expect(responseData.message).toContain("Intro to Computer Science");
  });

  it("accepts requests with valid X-Canvas-Bridge-Token header when pairing token is configured", async () => {
    const secretToken = "a1b2c3d4e5f67890123456789abcdef0";
    const mockHandler = vi.fn().mockResolvedValue({ isNew: false, courseFolder: "Canvas/CS101" } as CourseSyncResult);
    const settings: CanvasSyncSettings = { ...DEFAULT_SETTINGS, bridgePairingToken: secretToken };
    const server = new CanvasBridgeServer(settings, mockHandler);

    const { execute } = createMockBridgeRequest({
      method: "POST",
      url: "/canvas-sync",
      headers: {
        [BRIDGE_PAIRING_HEADER]: secretToken
      },
      body: validBody
    });

    const res = await execute(server);

    expect(res.statusCode).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(1);
    const responseData = JSON.parse(res.body);
    expect(responseData.ok).toBe(true);
  });

  it("accepts requests with valid Authorization Bearer token header when pairing token is configured", async () => {
    const secretToken = "a1b2c3d4e5f67890123456789abcdef0";
    const mockHandler = vi.fn().mockResolvedValue({ isNew: false, courseFolder: "Canvas/CS101" } as CourseSyncResult);
    const settings: CanvasSyncSettings = { ...DEFAULT_SETTINGS, bridgePairingToken: secretToken };
    const server = new CanvasBridgeServer(settings, mockHandler);

    const { execute } = createMockBridgeRequest({
      method: "POST",
      url: "/canvas-sync",
      headers: {
        authorization: `Bearer ${secretToken}`
      },
      body: validBody
    });

    const res = await execute(server);

    expect(res.statusCode).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(1);
    const responseData = JSON.parse(res.body);
    expect(responseData.ok).toBe(true);
  });

  it("rejects requests with missing token header with HTTP 401 when pairing token is configured", async () => {
    const secretToken = "a1b2c3d4e5f67890123456789abcdef0";
    const mockHandler = vi.fn();
    const settings: CanvasSyncSettings = { ...DEFAULT_SETTINGS, bridgePairingToken: secretToken };
    const server = new CanvasBridgeServer(settings, mockHandler);

    const { execute } = createMockBridgeRequest({
      method: "POST",
      url: "/canvas-sync",
      headers: {},
      body: validBody
    });

    const res = await execute(server);

    expect(res.statusCode).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
    const responseData = JSON.parse(res.body);
    expect(responseData.ok).toBe(false);
    expect(responseData.message).toBe("Unauthorized: Invalid or missing bridge pairing token.");
  });

  it("rejects requests with mismatched X-Canvas-Bridge-Token header with HTTP 401", async () => {
    const secretToken = "a1b2c3d4e5f67890123456789abcdef0";
    const mockHandler = vi.fn();
    const settings: CanvasSyncSettings = { ...DEFAULT_SETTINGS, bridgePairingToken: secretToken };
    const server = new CanvasBridgeServer(settings, mockHandler);

    const { execute } = createMockBridgeRequest({
      method: "POST",
      url: "/canvas-sync",
      headers: {
        [BRIDGE_PAIRING_HEADER]: "wrong-invalid-token"
      },
      body: validBody
    });

    const res = await execute(server);

    expect(res.statusCode).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
    const responseData = JSON.parse(res.body);
    expect(responseData.ok).toBe(false);
    expect(responseData.message).toBe("Unauthorized: Invalid or missing bridge pairing token.");
  });

  it("rejects requests with mismatched Authorization Bearer token with HTTP 401", async () => {
    const secretToken = "a1b2c3d4e5f67890123456789abcdef0";
    const mockHandler = vi.fn();
    const settings: CanvasSyncSettings = { ...DEFAULT_SETTINGS, bridgePairingToken: secretToken };
    const server = new CanvasBridgeServer(settings, mockHandler);

    const { execute } = createMockBridgeRequest({
      method: "POST",
      url: "/canvas-sync",
      headers: {
        authorization: "Bearer wrong-token"
      },
      body: validBody
    });

    const res = await execute(server);

    expect(res.statusCode).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
    const responseData = JSON.parse(res.body);
    expect(responseData.ok).toBe(false);
    expect(responseData.message).toBe("Unauthorized: Invalid or missing bridge pairing token.");
  });

  it("includes X-Canvas-Bridge-Token and Authorization in CORS preflight response headers", async () => {
    const mockHandler = vi.fn();
    const settings: CanvasSyncSettings = { ...DEFAULT_SETTINGS, bridgePairingToken: "secret123" };
    const server = new CanvasBridgeServer(settings, mockHandler);

    const { execute } = createMockBridgeRequest({
      method: "OPTIONS",
      url: "/canvas-sync",
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "Content-Type, X-Canvas-Sync-Client, X-Canvas-Bridge-Token, Authorization"
      }
    });

    const res = await execute(server);

    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Headers"]).toContain("X-Canvas-Bridge-Token");
    expect(res.headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });
});



