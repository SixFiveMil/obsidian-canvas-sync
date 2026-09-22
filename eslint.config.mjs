import obsidianmd from "eslint-plugin-obsidianmd";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "apps/**",
      "dist/**",
      "release/**",
      "node_modules/**",
      "main.js",
      "scripts/**",
      "tests/**",
      "esbuild.config.mjs"
    ]
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    rules: {
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          acronyms: [
            "API",
            "URL",
            "REST",
            "MB",
            "YAML",
            "HTTP",
            "HTTPS",
            "HTML",
            "JSON",
            "PDF",
            "DOCX",
            "PPTX",
            "XLSX",
            "ZIP",
            "PNG",
            "JPG",
            "JPEG",
            "GIF",
            "SVG",
            "WEBP",
            "CSV",
            "TXT",
            "RTF",
            "TAR",
            "IPYNB",
            "PY",
            "JAVA",
            "CPP",
            "JS",
            "TS",
            "CORS"
          ],
          brands: [
            "Obsidian",
            "Canvas",
            "Chrome",
            "Firefox",
            "Zoom",
            "Brave",
            "Edge",
            "Arc",
            "Opera",
            "Markdown",
            "LaTeX",
            "iOS",
            "Android",
            "Dataview",
            "Tasks",
            "Templater"
          ]
        }
      ]
    }
  }
];
