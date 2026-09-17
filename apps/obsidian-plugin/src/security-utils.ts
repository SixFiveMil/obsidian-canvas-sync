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

export function getAllowedExtensionOrigin(originHeader?: string | null): string | null {
  if (typeof originHeader !== "string") {
    return null;
  }

  if (originHeader.startsWith("chrome-extension://") || originHeader.startsWith("moz-extension://")) {
    return originHeader;
  }

  return null;
}

export function sanitizeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Untitled";
}

export function sanitizePath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => sanitizeFileName(segment))
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    .join("/");
}
