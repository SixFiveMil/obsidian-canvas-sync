/**
 * @module utils/yaml-utils
 * @description YAML frontmatter formatting and generation utilities for Obsidian notes.
 * Formats frontmatter metadata cleanly for Dataview and Obsidian Tasks plugins.
 */

/**
 * Formats an ISO string to a UTC ISO timestamp or null if invalid/missing.
 * Preserves explicit ISO representations without modifying timezone if already formatted.
 */
export function formatIsoTimestamp(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? trimmed : d.toISOString();
  } catch {
    return trimmed;
  }
}

/**
 * Formats an ISO string to a YYYY-MM-DD date string or null if invalid/missing.
 */
export function formatIsoDate(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  try {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Formats a string safely for YAML, quoting if it contains special characters, colons, brackets, or numbers/booleans.
 *
 * @param val - The string to format.
 * @param inArray - Whether this string is being rendered inside an inline YAML array.
 */
export function formatYamlString(val: string, inArray = false): string {
  if (inArray) {
    const escaped = val
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, " ");
    return `"${escaped}"`;
  }

  if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.test(val)) {
    return val;
  }

  const needsQuotes =
    val === "" ||
    /^[\s\t]|[\s\t]$/.test(val) ||
    /[:[\]{}&*#?|<>!=%@\\"'`~,/]/.test(val) ||
    /^-\s/.test(val) ||
    /[-+]\s*$/.test(val) ||
    /^(true|false|yes|no|on|off|null|~)$/i.test(val) ||
    /^-?\d+(\.\d+)?$/.test(val);

  if (needsQuotes) {
    const escaped = val
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, " ");
    return `"${escaped}"`;
  }
  return val;
}

/**
 * Formats any JS primitive, array, or object value for YAML frontmatter.
 *
 * @param val - The value to format.
 * @param inArray - Whether this value is inside an array.
 */
export function formatYamlValue(val: unknown, inArray = false): string {
  if (val === null || val === undefined) {
    return "null";
  }
  if (typeof val === "boolean") {
    return val ? "true" : "false";
  }
  if (typeof val === "number") {
    return Number.isFinite(val) ? String(val) : "null";
  }
  if (typeof val === "string") {
    return formatYamlString(val, inArray);
  }
  if (Array.isArray(val)) {
    const items = val
      .filter((item) => item !== undefined && item !== null)
      .map((item) => formatYamlValue(item, true));
    return `[${items.join(", ")}]`;
  }
  return JSON.stringify(val);
}

/**
 * Generates valid YAML frontmatter bounded by --- from a properties record.
 */
export function generateYamlFrontmatter(props: Record<string, unknown>): string {
  const entries = Object.entries(props).filter(
    ([_, val]) => val !== undefined && val !== null && (!Array.isArray(val) || val.length > 0)
  );

  if (entries.length === 0) {
    return "";
  }

  const lines: string[] = ["---"];
  for (const [key, val] of entries) {
    if (Array.isArray(val)) {
      const items = val
        .filter((item) => item !== undefined && item !== null)
        .map((item) => formatYamlValue(item, true));
      if (items.length > 0) {
        lines.push(`${key}: [${items.join(", ")}]`);
      }
    } else {
      lines.push(`${key}: ${formatYamlValue(val, false)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
