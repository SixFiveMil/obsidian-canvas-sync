import TurndownService from "turndown";
import { highlightedCodeBlock, strikethrough, taskListItems } from "turndown-plugin-gfm";

export function canvasTablePlugin(turndownService: TurndownService): void {
  turndownService.addRule("cleanTableCaption", {
    filter: "caption",
    replacement: function (content) {
      const trimmed = content.trim();
      return trimmed ? `\n\n**${trimmed}**\n\n` : "";
    }
  });

  turndownService.addRule("cleanTableCell", {
    filter: ["th", "td"],
    replacement: function (content, node) {
      const el = node as HTMLElement;
      let clean = content
        .replace(/&nbsp;/gi, " ")
        .replace(/(?<!\\)\|/g, "\\|")
        .replace(/\r?\n+/g, "<br>")
        .replace(/\s*<br\s*\/?>\s*/gi, "<br>")
        .replace(/^(?:<br>)+|(?:<br>)+$/gi, "")
        .replace(/(?:<br>){2,}/gi, "<br>")
        .replace(/\s+/g, " ")
        .trim();

      const siblings = Array.from(el.parentNode?.childNodes ?? []).filter(
        (n): n is HTMLElement => n.nodeName === "TH" || n.nodeName === "TD"
      );
      const index = siblings.indexOf(el);
      const prefix = index === 0 ? "| " : " ";

      const colSpanAttr = el.getAttribute("colspan");
      const colSpan = colSpanAttr ? Number.parseInt(colSpanAttr, 10) || 1 : 1;

      let cellStr = prefix + clean + " |";
      for (let i = 1; i < colSpan; i++) {
        cellStr += " |";
      }
      return cellStr;
    }
  });

  turndownService.addRule("cleanTableRow", {
    filter: "tr",
    replacement: function (content, node) {
      const tr = node as HTMLElement;
      const parent = tr.parentNode as HTMLElement | null;
      const isThead = parent?.nodeName === "THEAD";
      const isFirstRow = isFirstTableRow(tr);

      let borderRow = "";
      if (isThead || isFirstRow) {
        const alignMap: Record<string, string> = { left: ":---", right: "---:", center: ":-:" };
        const cells = Array.from(tr.childNodes).filter(
          (n): n is HTMLElement => n.nodeName === "TH" || n.nodeName === "TD"
        );
        let borders = "";
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          const alignAttr = (cell.getAttribute("align") || "").toLowerCase();
          const alignStyle = (cell.style?.textAlign || "").toLowerCase();
          const align = alignAttr || alignStyle;
          const border = alignMap[align] || "---";

          const colSpanAttr = cell.getAttribute("colspan");
          const colSpan = colSpanAttr ? Number.parseInt(colSpanAttr, 10) || 1 : 1;

          for (let c = 0; c < colSpan; c++) {
            borders += (i === 0 && c === 0 ? "| " : " ") + border + " |";
          }
        }
        if (borders) {
          borderRow = "\n" + borders;
        }
      }

      return "\n" + content.trim() + borderRow;
    }
  });

  turndownService.addRule("cleanTable", {
    filter: "table",
    replacement: function (content) {
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const captionLines: string[] = [];
      const tableLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("|")) {
          tableLines.push(line);
        } else {
          captionLines.push(line);
        }
      }

      if (tableLines.length === 0) {
        return "";
      }

      const captionBlock = captionLines.length > 0 ? captionLines.join("\n\n") + "\n\n" : "";
      return "\n\n" + captionBlock + tableLines.join("\n") + "\n\n";
    }
  });

  turndownService.addRule("cleanTableSection", {
    filter: ["thead", "tbody", "tfoot"],
    replacement: function (content) {
      return content;
    }
  });

  function isFirstTableRow(tr: HTMLElement): boolean {
    const parent = tr.parentNode as HTMLElement | null;
    if (!parent) return false;
    if (parent.nodeName === "TABLE") {
      const rows = Array.from(parent.children).filter((c) => c.nodeName === "TR");
      return rows[0] === tr;
    }
    if (parent.nodeName === "TBODY") {
      const table = parent.parentNode as HTMLElement | null;
      if (!table) return false;
      const thead = Array.from(table.children).find((c) => c.nodeName === "THEAD");
      if (thead && Array.from(thead.children).some((c) => c.nodeName === "TR")) {
        return false;
      }
      const tbodies = Array.from(table.children).filter((c) => c.nodeName === "TBODY");
      if (tbodies[0] === parent) {
        const rows = Array.from(parent.children).filter((c) => c.nodeName === "TR");
        return rows[0] === tr;
      }
    }
    return false;
  }
}

export function createCustomTurndown(): TurndownService {
  const service = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  service.use([highlightedCodeBlock, strikethrough, taskListItems, canvasTablePlugin]);
  return service;
}
