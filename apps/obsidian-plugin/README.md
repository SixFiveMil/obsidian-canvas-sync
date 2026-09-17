# Canvas Sync (Obsidian Plugin)

Directly synchronize Canvas LMS coursework, modules, assignments, student submissions, rubrics, grades, discussions, calendars, and files into your Obsidian vault as clean, interconnected Markdown notes.

---

## Installation

### Method 1: Obsidian Community Plugins (Recommended)
1. In Obsidian, go to **Settings** > **Community Plugins**.
2. Search for **Canvas Sync Bridge**.
3. Click **Install**, then click **Enable**.

### Method 2: Obsidian BRAT (Beta)
1. Install the [BRAT Plugin](https://github.com/TfTHacker/obsidian42-brat) in Obsidian.
2. Add `https://github.com/SixFiveMil/obsidian-canvas-sync`.

### Method 3: Manual Installation (GitHub Releases)
1. Download `manifest.json` and `main.js` from the [Latest GitHub Release](https://github.com/SixFiveMil/obsidian-canvas-sync/releases/latest).
2. In your vault, navigate to `.obsidian/plugins/canvas-sync-bridge/` (create this folder if it does not exist).
3. Place `manifest.json` and `main.js` into this folder.
4. Reload Obsidian plugins and enable **Canvas Sync Bridge**.

---

## Configuration

| Setting | Default | Description |
| :--- | :--- | :--- |
| **Canvas Base URL** | *Required* | Institutional Canvas URL (e.g. `https://canvas.instructure.com` or `https://canvas.institution.edu`). |
| **Canvas API Token** | *Required* | Personal access token generated in Canvas LMS (`Account > Settings > Approved Integrations > + New Access Token`). |
| **Include Inactive Courses** | `true` | When enabled, includes concluded and past courses in the course picker modal. |
| **Sync Discussion Replies** | `true` | Downloads complete multi-tier reply threads for discussion boards. |
| **Sync Student Submissions** | `true` | Downloads student submission files, assignment scores, and teacher comments. |
| **Enable Browser Bridge Listener** | `false` | When enabled, opens local port `127.0.0.1:27125` to receive payloads from the companion browser extension. |
| **Bridge Listen Port** | `27125` | Local loopback port for the browser extension bridge. |
| **Root Folder** | `Canvas` | Destination folder path within the Obsidian vault. |
| **Course Folder Template** | `{{courseCode}} - {{courseName}}` | Formatting template for course directories. |
| **Download Assets & Documents** | `true` | Automatically downloads linked course files and embedded media. |
| **Allowed File Extensions** | `pdf, docx, pptx, xlsx, png, jpg, jpeg, svg, zip` | Comma-separated list of permitted file extensions. |
| **Max Asset Size (MB)** | `50` | Maximum file size threshold for document downloads. |
| **Documents Subfolder** | `Files` | Subfolder within each course directory for document downloads. |
| **Attachments Subfolder** | `Attachments` | Subfolder within each course directory for embedded images and diagrams. |

---

## Output Layout

For each synced course:

```text
Canvas/<Course Folder>/
├── Course.md         # Master index note with metadata and quick links
├── Home.md           # Course home page content and banner
├── Syllabus.md       # Complete syllabus text and course policies
├── Tasks.md          # Assignments, due dates, point values, and submissions
├── Grades.md         # Gradebook table with scores, percentages, and status
├── Discussions.md    # Discussion board topics and student replies
├── Calendar.md       # Course events, exam dates, and milestones
├── Modules/
│   └── <NN - Module Name>/
│       ├── 00 - Module Overview.md
│       └── <NN - Type - Title>.md
├── Files/            # Downloaded course documents (PDF, DOCX, XLSX, etc.)
└── Attachments/      # Embedded images, course banners, and diagrams
```

---

## Development & Building from Source

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Build production bundle
npm run build:plugin
```
