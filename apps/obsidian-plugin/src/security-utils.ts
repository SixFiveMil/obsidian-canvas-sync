import type { CanvasSyncEnvelope } from "./types";

export function validateEnvelopeShape(envelope: CanvasSyncEnvelope): void {
  if (!envelope || envelope.source !== "canvas-browser-extension") {
    throw new Error("Unexpected payload source.");
  }

  if (envelope.version !== "1") {
    throw new Error("Unsupported payload version.");
  }

  if (!envelope.payload?.courseId || !envelope.payload?.courseName) {
    throw new Error("Missing required course metadata.");
  }
}

export function sanitizeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Untitled";
}
