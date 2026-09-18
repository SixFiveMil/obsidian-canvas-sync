import type { CanvasSyncEnvelope } from "./types";

export function validateEnvelopeShape(envelope: unknown): asserts envelope is CanvasSyncEnvelope {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Invalid payload: payload is not an object.");
  }

  const env = envelope as Partial<CanvasSyncEnvelope>;
  if (env.source !== "canvas-browser-extension") {
    throw new Error("Unexpected payload source.");
  }

  if (env.version !== "1") {
    throw new Error("Unsupported payload version.");
  }

  if (!env.payload || typeof env.payload !== "object") {
    throw new Error("Missing payload content.");
  }

  if (!env.payload.courseId || !env.payload.courseName) {
    throw new Error("Missing required course metadata (courseId, courseName).");
  }
}

export function isAllowedOrigin(originHeader?: string | null): boolean {
  if (!originHeader) {
    // Background service workers on localhost do not send Origin header; allowed
    return true;
  }
  return originHeader.startsWith("chrome-extension://") || originHeader.startsWith("moz-extension://");
}

export function getAllowedExtensionOrigin(originHeader?: string | null): string | null {
  if (typeof originHeader !== "string") {
    return null;
  }

  if (originHeader.startsWith("chrome-extension://") || originHeader.startsWith("moz-extension://")) {
    return originHeader;
  }

  return null;
}

export function sanitizeFileName(input: string, maxLength = 100): string {
  if (!input || typeof input !== "string") {
    return "Untitled";
  }

  const cleaned = input.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "Untitled";
  }

  const truncated = cleaned.slice(0, maxLength).trim().replace(/[.\-\s]+$/, "");
  return truncated || "Untitled";
}

export function sanitizePath(input: string, maxSegmentLength = 100): string {
  return input
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== ".." && !/^\.+$/.test(segment))
    .map((segment) => sanitizeFileName(segment, maxSegmentLength))
    .filter((segment) => segment.length > 0)
    .join("/");
}
