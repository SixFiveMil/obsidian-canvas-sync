/**
 * @module utils/date-utils
 * @description Helper functions for calculating dynamic Canvas course date windows
 * to ensure announcements, calendar events, and todo items are completely retrieved.
 */

export interface CourseDateRangeOptions {
  startDate?: string;
  endDate?: string;
  courseSummary?: {
    start_at?: string | null;
    end_at?: string | null;
    term?: { start_at?: string | null; end_at?: string | null };
    created_at?: string | null;
  };
  bufferDays?: number;
}

/**
 * Computes the start and end dates formatted as YYYY-MM-DD for Canvas API range queries.
 * Adds a buffer before course start and after course end (default 60 days) to capture
 * welcome messages, early syllabi, and post-term updates.
 */
export function resolveCourseDateRange(options?: CourseDateRangeOptions): {
  startDate: string;
  endDate: string;
} {
  const bufferDays = options?.bufferDays ?? 60;
  let startDate = options?.startDate;
  let endDate = options?.endDate;

  if (!startDate && options?.courseSummary) {
    const summary = options.courseSummary;
    const rawStart = summary.start_at || summary.term?.start_at || summary.created_at;
    if (rawStart) {
      try {
        const d = new Date(rawStart);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() - bufferDays);
          startDate = d.toISOString().slice(0, 10);
        }
      } catch {
        // Fallback
      }
    }
  }

  if (!endDate && options?.courseSummary) {
    const summary = options.courseSummary;
    const rawEnd = summary.end_at || summary.term?.end_at;
    if (rawEnd) {
      try {
        const d = new Date(rawEnd);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + bufferDays);
          endDate = d.toISOString().slice(0, 10);
        }
      } catch {
        // Fallback
      }
    }
  }

  return {
    startDate: startDate || "2000-01-01",
    endDate: endDate || "2099-12-31"
  };
}
