# Privacy Policy for Canvas Sync (Obsidian Plugin)

**Effective Date:** September 17, 2026  
**Last Updated:** September 17, 2026  
**Plugin Name:** Canvas Sync Bridge / Canvas Sync  
**Developer:** Joshua (@SixFiveMil)  
**Open Source Repository:** [https://github.com/SixFiveMil/obsidian-canvas-sync](https://github.com/SixFiveMil/obsidian-canvas-sync)  

---

## 1. Executive Summary

**Canvas Sync** is committed to absolute user privacy. Our philosophy is simple: **your academic coursework, notes, and personal data belong entirely to you.**

- **Zero Cloud Servers:** We do not operate any external cloud servers, databases, or analytics infrastructure.
- **Zero Data Collection:** We do not collect, harvest, monitor, monetize, or track your personally identifiable information (PII), academic records, or coursework.
- **Direct Canvas API Connection:** All synchronization occurs directly between your local Obsidian client and your institution's Canvas LMS over encrypted HTTPS via Obsidian's native `requestUrl` API.
- **No Third-Party Sharing or Sale:** We never sell, transfer, rent, or trade your data to third parties, data brokers, or advertising networks.

---

## 2. Information Handled by the Plugin

Canvas Sync processes data solely to facilitate the download and formatting of your coursework from Canvas LMS to your personal Obsidian vault. The data processed includes:

### A. Academic Course Content
- **What is accessed:** Course metadata (course code, title), module structure, page content, assignment briefs, structured rubrics, syllabus text, announcements, discussion topics and reply trees, calendar events, grades, and course file attachments.
- **How it is processed:** When you select courses and trigger synchronization, the plugin requests course resources directly from your institution's Canvas REST API (`https://<canvas-domain>/api/v1/...`), converts HTML content into clean GitHub Flavored Markdown (GFM), resolves cross-links into Obsidian wikilinks (`[[...]]`), and writes structured Markdown files and downloaded assets directly into your vault.
- **Where it is sent:** Data flows strictly between your institution's Canvas server and your local Obsidian vault. It is never transmitted anywhere else.
- **Retention:** All notes and files are stored entirely within your local Obsidian vault under your full control.

### B. Authentication & Credentials
- **Canvas API Token:** You generate a Personal Access Token within your Canvas LMS account (`Canvas -> Account -> Settings -> Approved Integrations -> + New Access Token`).
- **Local Storage:** The token and Canvas Base URL are stored strictly on your local machine within your Obsidian plugin settings file (`.obsidian/plugins/canvas-sync-bridge/data.json`).
- **No Third-Party Transmission:** The token is included solely in the `Authorization: Bearer <token>` HTTP header sent directly to your configured Canvas LMS domain.

---

## 3. Information We Do NOT Collect

To maintain full transparency, Canvas Sync explicitly does **NOT**:
- Collect or store names, email addresses, student IDs, passwords, or personal profiles on remote servers.
- Collect IP addresses or geolocation data.
- Use tracking cookies, tracking pixels, browser fingerprinting, or web beacons.
- Integrate any analytics, telemetry, crash reporting, or diagnostic SDKs (e.g., Google Analytics, Mixpanel, Sentry).

---

## 4. User Rights and Data Control

- **Full Ownership & Portability:** All synced course data is written directly to your local filesystem as transparent, open Markdown (`.md`) files and downloaded attachments. You have full, unrestricted ownership and portability of these files at all times.
- **Immediate Deletion:** You can delete synced course data at any time simply by deleting the course folders from your Obsidian vault. You can revoke or delete your Canvas API token at any time in Canvas LMS settings or within the plugin settings tab.

---

## 5. Contact Information & Privacy Inquiries

If you have questions, concerns, or feedback regarding this Privacy Policy:

- **GitHub Issue Tracker:** [https://github.com/SixFiveMil/obsidian-canvas-sync/issues](https://github.com/SixFiveMil/obsidian-canvas-sync/issues)
- **Repository:** [https://github.com/SixFiveMil/obsidian-canvas-sync](https://github.com/SixFiveMil/obsidian-canvas-sync)
- **Maintainer:** Joshua (@SixFiveMil)
