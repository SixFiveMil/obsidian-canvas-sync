export interface CanvasUserSummary {
  id: number;
  name: string;
  short_name?: string;
  primary_email?: string;
}

export interface CanvasCourseGrades {
  currentScore?: number | null;
  currentGrade?: string | null;
  finalScore?: number | null;
  finalGrade?: string | null;
}

export interface CanvasCourseSummary {
  id: number;
  name: string;
  course_code?: string;
  enrollment_term_id?: number;
  term?: {
    id: number;
    name: string;
  };
  workflow_state?: string;
  start_at?: string | null;
  end_at?: string | null;
  concluded?: boolean;
  grades?: CanvasCourseGrades;
  enrollments?: Array<{
    type: string;
    role: string;
    enrollment_state: string;
    grades?: {
      current_score?: number | null;
      current_grade?: string | null;
      final_score?: number | null;
      final_grade?: string | null;
    };
  }>;
}

export interface CanvasPagePayload {
  title: string;
  html: string;
  url: string;
  slug?: string;
  updatedAt?: string;
  moduleNames?: string[];
}

export interface CanvasModuleItemPayload {
  id: string;
  position: number;
  title: string;
  type:
    | "WikiPage"
    | "Assignment"
    | "DiscussionTopic"
    | "ExternalUrl"
    | "ContextModuleSubHeader"
    | "ContextExternalTool"
    | "File";
  indent?: number;
  pageSlug?: string;
  assignmentId?: string;
  discussionId?: string;
  fileId?: string;
  externalUrl?: string;
}

export interface CanvasModulePayload {
  id: string;
  name: string;
  position: number;
  summaryHtml?: string;
  items: CanvasModuleItemPayload[];
}

export interface CanvasSubmissionComment {
  authorName: string;
  comment: string;
  createdAt: string;
}

export interface CanvasSubmissionAttachment {
  id: string;
  displayName: string;
  url: string;
  size?: number;
  contentType?: string;
  downloaded?: boolean;
  savedRelativePath?: string;
}

export interface CanvasRubricAssessmentEntry {
  criterionId: string;
  points?: number | null;
  comments?: string | null;
}

export interface CanvasSubmissionPayload {
  id?: string;
  submittedAt?: string | null;
  workflowState?: "submitted" | "graded" | "unsubmitted" | "pending_review" | string;
  score?: number | null;
  grade?: string | null;
  body?: string | null;
  url?: string | null;
  submissionType?: string | null;
  late?: boolean;
  missing?: boolean;
  excused?: boolean;
  comments?: CanvasSubmissionComment[];
  rubricAssessment?: Record<string, CanvasRubricAssessmentEntry>;
  attachments?: CanvasSubmissionAttachment[];
}

export interface CanvasAssignmentPayload {
  id: string;
  name: string;
  dueAt?: string | null;
  pointsPossible?: number | null;
  htmlUrl?: string;
  descriptionHtml?: string;
  submissionTypes?: string[];
  moduleNames?: string[];
  rubric?: CanvasRubricCriterionPayload[];
  submission?: CanvasSubmissionPayload;
}

export interface CanvasRubricRatingPayload {
  description: string;
  longDescription?: string;
  points: number;
}

export interface CanvasRubricCriterionPayload {
  id: string;
  description: string;
  longDescription?: string;
  points: number;
  ratings: CanvasRubricRatingPayload[];
}

export interface CanvasDiscussionEntryPayload {
  id: string;
  userId?: string;
  userName: string;
  messageHtml: string;
  createdAt: string;
  updatedAt?: string;
  replies?: CanvasDiscussionEntryPayload[];
}

export interface CanvasDiscussionPayload {
  id: string;
  title: string;
  assignmentId?: string;
  htmlUrl?: string;
  messageHtml?: string;
  postedAt?: string | null;
  updatedAt?: string | null;
  moduleNames?: string[];
  entries?: CanvasDiscussionEntryPayload[];
  assignment?: CanvasAssignmentPayload;
  submission?: CanvasSubmissionPayload;
}

export interface CanvasEventPayload {
  id: string;
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  htmlUrl?: string;
  description?: string;
  eventType?: "event" | "assignment" | string;
  assignmentId?: string;
}

export interface CanvasFileAssetPayload {
  id: string;
  displayName: string;
  url: string;
  size?: number;
  contentType?: string;
  folderPath?: string;
  moduleNames?: string[];
  downloaded?: boolean;
  savedRelativePath?: string;
}

export interface AssetSyncDiagnostics {
  apiRestricted: boolean;
  totalDiscovered: number;
  totalDownloaded: number;
  totalSkippedSize: number;
  totalFilteredExtension: number;
  skippedFiles: Array<{
    name: string;
    reason: "size_limit" | "extension_filtered" | "auth_restricted" | "error";
    size?: number;
    message?: string;
  }>;
}

export interface AssetSyncFilterConfig {
  downloadAssets: boolean;
  downloadDocuments: boolean;
  downloadImages: boolean;
  downloadArchivesAndCode: boolean;
  downloadMedia: boolean;
  allowedExtensions: string;
  maxAssetSizeMb: number;
}

export interface CanvasCoursePayload {
  courseId: string;
  courseName: string;
  courseCode?: string;
  fetchedAt: string;
  grades?: CanvasCourseGrades;
  courseHomePageHtml?: string;
  syllabusHtml?: string;
  modules: CanvasModulePayload[];
  pages: CanvasPagePayload[];
  assignments: CanvasAssignmentPayload[];
  discussions: CanvasDiscussionPayload[];
  events: CanvasEventPayload[];
  files?: CanvasFileAssetPayload[];
  assetDiagnostics?: AssetSyncDiagnostics;
}

export interface CanvasSyncEnvelope {
  source: "canvas-browser-extension";
  version: "1";
  payload: CanvasCoursePayload;
}

export interface CanvasSyncSettings {
  canvasBaseUrl: string;
  canvasApiToken: string;
  includeInactiveCourses: boolean;
  syncDiscussionReplies: boolean;
  syncStudentSubmissions: boolean;
  enableBridgeServer: boolean;
  listenPort: number;
  rootFolder: string;
  courseFolderTemplate: string;
  includeRawPayload: boolean;
  downloadAssets: boolean;
  downloadDocuments: boolean;
  downloadImages: boolean;
  downloadArchivesAndCode: boolean;
  downloadMedia: boolean;
  allowedExtensions: string;
  maxAssetSizeMb: number;
  documentsSubfolder: string;
  attachmentsSubfolder: string;
}

