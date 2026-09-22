/**
 * @module constants
 * @description Centralized configuration constants and default settings for Canvas to Obsidian Sync.
 */

import type { CanvasSyncSettings } from "./types";

/**
 * Default settings applied when the plugin is installed for the first time or when new
 * configuration keys are introduced in updates.
 */
export const DEFAULT_SETTINGS: CanvasSyncSettings = {
  canvasBaseUrl: "",
  canvasApiToken: "",
  includeInactiveCourses: true,
  syncAnnouncements: true,
  syncDiscussionReplies: true,
  syncStudentSubmissions: true,
  enableBridgeServer: false,
  listenPort: 27125,
  bridgePairingToken: "",
  rootFolder: "Canvas",
  courseFolderTemplate: "{{courseCode}} - {{courseName}}",
  enableYamlFrontmatter: true,
  includeRawPayload: false,
  downloadAssets: true,
  downloadDocuments: true,
  downloadImages: true,
  downloadArchivesAndCode: false,
  downloadMedia: false,
  allowedExtensions: "pdf, docx, pptx, xlsx, png, jpg, jpeg, svg, zip",
  maxAssetSizeMb: 50,
  documentsSubfolder: "Files",
  attachmentsSubfolder: "Attachments",
  preservePersonalNotes: true,
  enableScheduledSync: false,
  scheduledSyncIntervalMinutes: 60,
  scheduledSyncSelectionMode: "all_active",
  scheduledCourseIds: [],
  silentScheduledSync: true
};

/**
 * Header key used to identify trusted bridge client requests from companion browser extensions.
 */
export const TRUSTED_CLIENT_HEADER = "x-canvas-sync-client";

/**
 * Header key used to authenticate bridge requests using a shared pairing token.
 */
export const BRIDGE_PAIRING_HEADER = "x-canvas-bridge-token";
