import { describe, expect, it } from "vitest";

import { createCustomTurndown } from "../src/table-utils";

describe("HTML to Markdown table conversion", () => {
  const turndown = createCustomTurndown();

  it("converts complex Canvas pacing guide tables to clean GFM tables", () => {
    const html = `
      <table class="module-pacing-guide" border="1" cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse; background-color: #ffffff;">
        <caption style="font-weight: bold; font-size: 16px;">Module Pacing Guide</caption>
        <thead>
          <tr style="background-color: #f2f4f7;">
            <th style="text-align: left; padding: 10px;">Week</th>
            <th style="text-align: center; padding: 10px;">Topics & Readings</th>
            <th style="text-align: right; padding: 10px;">Deliverables</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #e0e0e0;">
            <td style="font-weight: bold;">Week 1</td>
            <td>
              <p style="margin: 0 0 8px;">Introduction to Cyber Security</p>
              <p style="margin: 0; color: #555;">Readings: Chapter 1 & 2</p>
            </td>
            <td>
              <a href="https://canvas.example.edu/courses/123/assignments/1">Assignment 1</a>
              <br>
              <span style="color: #c00;">Due Sunday 11:59 PM</span>
            </td>
          </tr>
          <tr>
            <td>Week 2</td>
            <td>
              <div style="font-size: 13px;">Security Architecture | Threat Modeling</div>
            </td>
            <td>Quiz 1 (50 pts)</td>
          </tr>
        </tbody>
      </table>
    `;

    const markdown = turndown.turndown(html);

    // Should include caption as bold header
    expect(markdown).toContain("**Module Pacing Guide**");

    // Should contain standard GFM table structure
    expect(markdown).toContain("| Week | Topics & Readings | Deliverables |");
    expect(markdown).toContain("| :--- | :-: | ---: |");

    // Cell content should be cleanly formatted
    expect(markdown).toContain("Week 1");
    expect(markdown).toContain("Introduction to Cyber Security<br>Readings: Chapter 1 & 2");
    expect(markdown).toContain("[Assignment 1](https://canvas.example.edu/courses/123/assignments/1)<br>Due Sunday 11:59 PM");

    // Pipe character inside cell must be escaped
    expect(markdown).toContain("Security Architecture \\| Threat Modeling");

    // Must NOT contain any raw HTML table tags or inline CSS
    expect(markdown).not.toMatch(/<table\b/i);
    expect(markdown).not.toMatch(/<\/table>/i);
    expect(markdown).not.toMatch(/<tr\b/i);
    expect(markdown).not.toMatch(/<th\b/i);
    expect(markdown).not.toMatch(/<td\b/i);
    expect(markdown).not.toMatch(/style=["'][^"']*["']/i);
    expect(markdown).not.toMatch(/class=["'][^"']*["']/i);
    expect(markdown).not.toMatch(/<p\b/i);
    expect(markdown).not.toMatch(/<div\b/i);
    expect(markdown).not.toMatch(/<span\b/i);

    // Each table row should be on its own single line
    const tableLines = markdown
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|"));

    expect(tableLines.length).toBe(4); // Header, delimiter, and 2 data rows
    for (const line of tableLines) {
      expect(line.endsWith("|")).toBe(true);
    }
  });

  it("converts tables without THEAD (only TD cells in row 0)", () => {
    const html = `
      <table class="module-pacing-guide" style="width: 100%;">
        <tbody>
          <tr style="font-weight: bold; background: #eee;">
            <td align="left">Unit</td>
            <td align="center">Duration</td>
            <td align="right">Weight</td>
          </tr>
          <tr>
            <td>Unit 1</td>
            <td>2 Weeks</td>
            <td>20%</td>
          </tr>
        </tbody>
      </table>
    `;

    const markdown = turndown.turndown(html);

    expect(markdown).toContain("| Unit | Duration | Weight |");
    expect(markdown).toContain("| :--- | :-: | ---: |");
    expect(markdown).toContain("| Unit 1 | 2 Weeks | 20% |");
    expect(markdown).not.toMatch(/<table\b/i);
    expect(markdown).not.toMatch(/style=["'][^"']*["']/i);
  });

  it("handles colspan properly by maintaining column alignment", () => {
    const html = `
      <table>
        <thead>
          <tr>
            <th>Module</th>
            <th>Part A</th>
            <th>Part B</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Module 1</td>
            <td colspan="2">Comprehensive Exam</td>
          </tr>
        </tbody>
      </table>
    `;

    const markdown = turndown.turndown(html);

    expect(markdown).toContain("| Module | Part A | Part B |");
    expect(markdown).toContain("| Module 1 | Comprehensive Exam | |");
  });
});
