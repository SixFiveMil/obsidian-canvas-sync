# Privacy Policy for Canvas to Obsidian Sync

**Effective Date:** September 5, 2026  
**Last Updated:** September 5, 2026  
**Extension Name:** Canvas to Obsidian Sync  
**Developer:** Joshua (@SixFiveMil)  
**Open Source Repository:** [https://github.com/SixFiveMil/obsidian-canvas-sync](https://github.com/SixFiveMil/obsidian-canvas-sync)  

---

## 1. Executive Summary

**Canvas to Obsidian Sync** is committed to absolute user privacy. Our philosophy is simple: **your academic coursework, notes, and personal data belong entirely to you.**

- **Zero Cloud Servers:** We do not operate any external cloud servers, databases, or analytics infrastructure.
- **Zero Data Collection:** We do not collect, harvest, monitor, monetize, or track your personal identifiable information (PII), browsing history, or academic performance.
- **Strictly Local Loopback:** All course content extracted from Canvas LMS is transferred exclusively to your local Obsidian desktop client via a local loopback bridge (`http://127.0.0.1` / `http://localhost`).
- **No Third-Party Sharing or Sale:** We never sell, transfer, rent, or trade your data to third parties, data brokers, or advertising networks.

---

## 2. Information Handled by the Extension

Canvas to Obsidian Sync processes data solely to facilitate the transfer of coursework from Canvas LMS to your personal Obsidian vault. The data processed includes:

### A. Academic Course Content
- **What is accessed:** Course metadata (course code, title), module structure, page content, assignment briefs, rubrics, syllabus text, announcements, discussion prompts, and pacing guide tables.
- **How it is processed:** When you click the extension popup and choose to sync an active course, the extension reads the course DOM from your active Canvas tab, converts the HTML into clean GitHub Flavored Markdown (GFM), and temporarily holds the payload in memory.
- **Where it is sent:** The payload is transmitted immediately over an HTTP POST request to your local loopback address (`http://127.0.0.1:27125` by default) where your local Obsidian plugin receives it and writes it as Markdown files into your local vault directory.
- **Retention:** Data is held in browser memory only for the seconds required to complete the sync. It is never uploaded to remote servers.

### B. Authentication & Session Credentials
- **Browser Session:** The extension utilizes your active, existing logged-in browser session with your university or institution's Canvas LMS.
- **No Credential Logging:** The extension does **not** read, intercept, capture, log, or transmit your Canvas username, password, multi-factor authentication (MFA) codes, or session cookies.
- **Optional API Token:** If you optionally provide a personal Canvas API token (for institutions with restricted frontend page access), this token is stored strictly in your browser's private local storage (`chrome.storage.local`) on your machine. It is never transmitted anywhere other than directly to your institution's official Canvas domain (`*.instructure.com` or custom institution domain) to fulfill your requested sync.

### C. Local Extension Preferences
- User preferences such as custom local bridge port (default: 27125), folder naming templates (e.g. `{{courseCode}} - {{courseName}}`), and sync timestamps are stored locally on your device via Chrome's `chrome.storage.local` API.

---

## 3. Information We Do NOT Collect

To maintain full transparency, Canvas to Obsidian Sync explicitly does **NOT**:
- Collect or store names, email addresses, phone numbers, or physical addresses.
- Monitor, record, or track your web browsing history outside of your active Canvas course tab when explicitly instructed to sync.
- Collect IP addresses or geolocation data.
- Collect financial, billing, or payment information.
- Collect student grades, submitted work, or peer feedback without your explicit initiation.
- Use tracking cookies, tracking pixels, browser fingerprinting, or web beacons.
- Integrate any analytics, telemetry, crash reporting, or diagnostic SDKs (e.g., Google Analytics, Mixpanel, Sentry).

---

## 4. Chrome Extension Permissions & Technical Justifications

Canvas to Obsidian Sync adheres to the principle of least privilege, requiring **zero install-time host permissions** and **zero access to your browsing history**:

| Permission | Category | Purpose & Technical Justification |
| :--- | :--- | :--- |
| `activeTab` | Required | Grants temporary access to the active browser tab only when you explicitly interact with the extension popup. This allows the extension to extract syllabus, module, and assignment data from the open Canvas course without needing broad host permissions or background tab monitoring. |
| `scripting` | Required | Allows the extension to execute content extraction logic within the active Canvas course tab to parse DOM elements and convert coursework HTML into structured Markdown. |
| `storage` | Required | Enables `chrome.storage.local` to store your local preferences (e.g., bridge port number, folder naming format, recent sync metadata) entirely on your local device. |
| `optional_host_permissions`<br>`http://127.0.0.1/*`<br>`http://localhost/*` | Optional<br>(User Prompted) | Requested only when you click "Test Bridge" or "Sync Active Course". Grants permission to transmit the local HTTP POST sync payload to your local Obsidian desktop client on the loopback interface. Does not access external websites. |

*Note: The extension explicitly does **not** request the `tabs` permission (it cannot read your browsing history) and does **not** request permanent host permissions for external websites.*

---

## 5. Compliance with Chrome Web Store Limited Use Requirements

Canvas to Obsidian Sync adheres strictly to the **Chrome Web Store User Data Policy**, including the **Limited Use** requirements:

1. **Single Purpose:** The extension operates with the single, unified purpose of exporting Canvas LMS course materials to Obsidian notes.
2. **No Data Sales:** We do not sell, license, rent, or monetize user data under any circumstances.
3. **No Unrelated Transfers:** User data is never transferred, shared, or disclosed to third parties for purposes unrelated to the core sync functionality.
4. **No Advertising or Marketing:** User data is never used or transferred to serve targeted advertisements, personalized marketing, or promotional campaigns.
5. **No Creditworthiness Evaluation:** User data is never used or transferred to determine creditworthiness or for consumer lending purposes.

---

## 6. Data Storage, Security, and Retention

- **Local Storage Only:** All configuration and processed course data reside on your local machine.
- **Local Bridge Security:** The local HTTP bridge between the browser extension and Obsidian runs exclusively on the loopback network adapter (`127.0.0.1`), ensuring that no other devices on your local network or the internet can access or intercept the sync stream.
- **Request Verification:** Requests to the local bridge incorporate custom application headers (`X-Canvas-Sync-Client`) to mitigate unauthorized cross-origin requests.
- **No Remote Retention:** Because no user data is ever sent to our servers, we have no mechanism to retain, inspect, or compromise your information.

---

## 7. User Rights and Data Control

Under global privacy regulations (including GDPR, CCPA, and COPPA):
- **Right to Access & Portability:** All synced course data is written directly to your local file system as transparent, open Markdown (`.md`) files. You have full, unrestricted ownership and portability of these files at all times.
- **Right to Deletion:** You can delete synced course data at any time by removing the files from your Obsidian vault. To erase all extension settings, right-click the extension icon in Chrome and select "Remove from Chrome" or clear extension data via `chrome://extensions`.

---

## 8. Children's Online Privacy (COPPA)

Canvas to Obsidian Sync does not knowingly collect or solicit any information from children under the age of 13. The extension operates as an educational productivity utility without user account creation or remote tracking.

---

## 9. Changes to This Privacy Policy

If we update this Privacy Policy (for example, to reflect new features or regulatory requirements), we will update the **Last Updated** date at the top of this page and commit the revised policy directly to the public GitHub repository. Significant changes will be detailed in the project release notes.

---

## 10. Contact Information & Privacy Inquiries

If you have questions, concerns, or feedback regarding this Privacy Policy or the security practices of Canvas to Obsidian Sync, please contact us:

- **GitHub Issue Tracker:** [https://github.com/SixFiveMil/obsidian-canvas-sync/issues](https://github.com/SixFiveMil/obsidian-canvas-sync/issues)
- **Repository:** [https://github.com/SixFiveMil/obsidian-canvas-sync](https://github.com/SixFiveMil/obsidian-canvas-sync)
- **Maintainer:** Joshua (@SixFiveMil)
