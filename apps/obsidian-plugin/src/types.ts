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
  type: "WikiPage" | "Assignment" | "DiscussionTopic" | "ExternalUrl" | "ContextModuleSubHeader" | "ContextExternalTool";
  indent?: number;
  pageSlug?: string;
  assignmentId?: string;
  discussionId?: string;
  externalUrl?: string;
}

export interface CanvasModulePayload {
  id: string;
  name: string;
  position: number;
  summaryHtml?: string;
  items: CanvasModuleItemPayload[];
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

export interface CanvasDiscussionPayload {
  id: string;
  title: string;
  htmlUrl?: string;
  messageHtml?: string;
  postedAt?: string | null;
  updatedAt?: string | null;
  moduleNames?: string[];
}

export interface CanvasEventPayload {
  id: string;
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  htmlUrl?: string;
  description?: string;
}

export interface CanvasCoursePayload {
  courseId: string;
  courseName: string;
  fetchedAt: string;
  courseHomePageHtml?: string;
  syllabusHtml?: string;
  modules: CanvasModulePayload[];
  pages: CanvasPagePayload[];
  assignments: CanvasAssignmentPayload[];
  discussions: CanvasDiscussionPayload[];
  events: CanvasEventPayload[];
}

export interface CanvasSyncEnvelope {
  source: "canvas-browser-extension";
  version: "1";
  payload: CanvasCoursePayload;
}
