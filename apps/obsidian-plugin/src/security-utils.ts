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
