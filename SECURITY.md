# Security Policy

## Overview

Security and privacy are core architectural requirements of **Canvas Sync**. Because this software interacts with academic information and stores a personal Canvas API token within the Obsidian environment, we take security vulnerabilities seriously.

---

## Supported Versions

Only the latest release of the Obsidian plugin is actively maintained for security patches.

| Component | Supported Version | Status |
| :--- | :--- | :--- |
| **Obsidian Plugin** (`apps/obsidian-plugin`) | `>= 0.3.1` | :white_check_mark: |
| **Browser Extension** (`apps/browser-extension`) | `>= 0.3.1` | :white_check_mark: |
| Versions `< 0.3.1` | `< 0.3.1` | :x: |

---

## Security Architecture & Threat Model

The plugin employs a defense-in-depth, local-first architecture:

1. **Direct Encrypted Transport**: All Canvas API requests are made over HTTPS directly to the user's configured Canvas LMS domain using Obsidian's native `requestUrl` API.
2. **Local Token Storage**: The Canvas API token is stored strictly in your local vault's plugin configuration (`.obsidian/plugins/canvas-sync-bridge/data.json`). It is never sent to any third-party or middleman server.
3. **Path Traversal Protection**: All folder names and file paths constructed from Canvas course metadata, module titles, and file attachments undergo strict sanitization (`sanitizeFileName` and `sanitizePath`) to prevent directory traversal outside the vault.
4. **Markdown Table Sanitization**: Pipe delimiters within links (`[[path\|alias]]`) are sanitized to prevent Markdown table formatting exploits or column corruption.
5. **Zero Telemetry**: No tracking, metrics, analytics, or crash reporters are present in the codebase.

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do **NOT** open a public issue. Report it through one of the following responsible disclosure channels:

1. **GitHub Security Advisory**: Submit a private advisory via [GitHub Security Advisories](https://github.com/SixFiveMil/obsidian-canvas-sync/security/advisories/new).
2. **Security Contact**: Email **Joshua A. Wortz** at `security@codeandcypher.com` with the subject line `[SECURITY] Canvas Sync Vulnerability Report`.

### Response Timeline

- **Initial Acknowledgment**: Within 48 hours of receipt.
- **Triage & Status Assessment**: Within 5 business days.
- **Remediation & Patch Release**: Targeted within 14–30 days depending on complexity and severity.
- **Public Disclosure**: Coordinated following release of a verified fix.
