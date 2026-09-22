/**
 * @module renderers/doc-renderer
 * @description Core document formatting utilities for injecting YAML frontmatter,
 * rendering HTML markdown blocks via Turndown, and formatting internal wikilinks to modules.
 */

import type TurndownService from "turndown";
import { formatSyncTimestamp, generateYamlFrontmatter } from "../utils";

/**
 * Prepends a YAML frontmatter block to markdown content if frontmatter generation is enabled
 * and valid non-empty properties are supplied.
 *
 * @param body - The raw markdown body text.
 * @param props - Key-value metadata dictionary.
 * @param enableYaml - Whether frontmatter generation is active in plugin settings.
 * @returns The final document text with frontmatter header.
 */
export function prependFrontmatter(
  body: string,
  props: Record<string, unknown>,
  enableYaml = true
): string {
  if (!enableYaml) {
    return body;
  }
  const fm = generateYamlFrontmatter(props);
  if (!fm) {
    return body;
  }
  return `${fm}\n\n${body.trimStart()}`;
}

/**
 * Converts a raw HTML string into clean Markdown using Turndown, adding an H1 title,
 * optional "Last Synced" timestamp callout, and YAML frontmatter.
 *
 * @param turndown - Configured TurndownService instance with GFM table support.
 * @param title - The top-level document heading title.
 * @param html - The raw HTML string from Canvas LMS.
 * @param lastSynced - Optional ISO timestamp when data was fetched.
 * @param extraProps - Optional YAML frontmatter properties.
 * @param prependCallout - Optional callout block to insert beneath title.
 * @param enableYaml - Whether YAML frontmatter is enabled in plugin settings.
 * @returns Complete Markdown document string.
 */
export function renderHtmlDoc(
  turndown: TurndownService,
  title: string,
  html: string,
  lastSynced?: string,
  extraProps?: Record<string, unknown>,
  prependCallout?: string,
  enableYaml = true
): string {
  const markdown = turndown.turndown(html).trim();
  const lines = [`# ${title}`, ""];
  if (lastSynced) {
    lines.push(`> [!INFO] **Last Synced**: ${formatSyncTimestamp(lastSynced)}`, "");
  }
  if (prependCallout) {
    lines.push(prependCallout, "");
  }
  lines.push(markdown || "No content available.");
  const body = lines.join("\n");
  if (extraProps) {
    return prependFrontmatter(body, extraProps, enableYaml);
  }
  return body;
}

/**
 * Formats a list of module names into Obsidian wikilinks pointing to their corresponding
 * module overview documents (`[[Modules/...|Module Title]]`).
 *
 * @param moduleNames - List of module names associated with an item.
 * @param moduleByName - Lookup map from lowercase module name to relative note path and title.
 * @param inTable - Set to true when rendering inside a Markdown table column to escape pipe characters (`\|`).
 * @returns Array of formatted wikilinks or plain text module titles.
 */
export function formatModuleLinks(
  moduleNames?: string[],
  moduleByName?: Map<string, { relativePath: string; title: string }>,
  inTable = false
): string[] {
  if (!moduleNames || moduleNames.length === 0) return [];
  const pipe = inTable ? "\\|" : "|";
  return moduleNames.map((mName) => {
    const modInfo = moduleByName?.get(mName.trim().toLowerCase());
    const cleanName = mName.replace(/\|/g, "\\|");
    return modInfo ? `[[${modInfo.relativePath}${pipe}${cleanName}]]` : cleanName;
  });
}
