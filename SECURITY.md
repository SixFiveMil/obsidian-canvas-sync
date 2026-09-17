# Security Policy

## Overview

Security and privacy are core architectural requirements of **Canvas to Obsidian Sync**. Because this software interacts with academic information and operates a local communication bridge between browser extensions and the Obsidian desktop environment, we take potential security vulnerabilities seriously.

---

## Supported Versions

Only the latest release of each component is actively maintained for security patches.

| Component | Supported Version |
| :--- | :--- |
| **Obsidian Plugin** (`apps/obsidian-plugin`) | `>= 0.2.4` |
| **Chrome Extension** (`apps/browser-extension`) | `>= 0.2.4` |
| **Firefox Add-on** (`apps/browser-extension`) | `>= 0.2.4` |

---

## Security Architecture & Threat Model

The application employs a defense-in-depth, local-first architecture designed to prevent unauthorized data access, cross-site request forgery (CSRF), and unintended data exfiltration:

1. **Strict Loopback Binding**: The Obsidian plugin's internal HTTP bridge binds exclusively to the local IPv4 loopback interface (`127.0.0.1`). It never binds to `0.0.0.0` or external network adapters, preventing remote LAN/WAN access.
2. **Origin Validation & CORS**: Preflight `OPTIONS` and `POST` sync requests strictly validate the browser `Origin` header against authorized extension schemes (`chrome-extension://` and `moz-extension://`). Non-extension browser origins (e.g. `http://`, `https://`) are rejected with `403 Forbidden`.
3. **Custom Application Header Verification**: Inbound requests must supply a valid `X-Canvas-Sync-Client: canvas-browser-extension` header. Standard Web pages cannot issue cross-origin requests with custom headers without passing preflight CORS checks.
4. **Path Sanitization**: All file paths constructed from Canvas course, module, and assignment names undergo strict sanitization and normalization to prevent path traversal attacks (`../`) outside the configured vault folder.
5. **Session Isolation & Token Storage**: The extension operates against existing authenticated Canvas sessions via the browser's active tab context (`activeTab`). If an optional Canvas API token is supplied by the user, it is stored strictly within browser-isolated local storage (`chrome.storage.local`) and is never sent to any destination other than the institution's official Canvas API endpoint.
6. **Zero Telemetry**: No tracking, metrics, crash analytics, or third-party telemetry services are incorporated into any component of this project.

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do **NOT** open a public issue or discuss it in public channels. Instead, report it through one of the following responsible disclosure channels:

1. **GitHub Security Advisory**: Submit a private advisory via [GitHub Security Advisories](https://github.com/SixFiveMil/obsidian-canvas-sync/security/advisories/new).
2. **Security Contact**: Email **Joshua A. Wortz** at `security@codeandcypher.com` with the subject line `[SECURITY] Canvas Sync Vulnerability Report`.

### What to Include in Your Report

To help us investigate and remediate the issue promptly, please include:
- A clear description of the vulnerability and its potential impact.
- Affected component(s) and version numbers.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Any proposed remediations or mitigations, if known.

### Response Timeline

- **Initial Acknowledgment**: Within 48 hours of receipt.
- **Triage & Status Assessment**: Within 5 business days.
- **Remediation & Patch Release**: Targeted within 14–30 days depending on complexity and severity.
- **Public Disclosure**: Coordinated following release of a verified fix.

---

## Safe Harbor

We support and encourage responsible security research. We commit to the following:

- We will **not** pursue legal action or initiate law enforcement complaints against individuals who discover and report vulnerabilities in good faith in accordance with this policy.
- We consider activities conducted under this policy to be authorized conduct under applicable computer abuse laws (such as the CFAA).
- If your research complies with this policy, we will work collaboratively with you to validate, patch, and publicly credit your contribution.

### Ground Rules for Safe Harbor

To remain within Safe Harbor protection:
- Do not exploit a vulnerability beyond what is strictly necessary to prove its existence (PoC).
- Do not access, modify, or destroy other users' data or systems.
- Do not perform Denial of Service (DoS/DDoS) attacks against any services or local processes.
- Give us reasonable time to remediate issues before making any public disclosure.

