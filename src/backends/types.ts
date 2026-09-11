/**
 * Shared data model for Apple Reminders, plus the contract every backend
 * implements. The AppleScript and CalDAV backends both normalise their very
 * different native shapes into these types so callers never have to care which
 * one is active.
 */

export type Priority = "none" | "low" | "medium" | "high";

export type BackendName = "applescript" | "caldav";

export interface ReminderList {
  /** Opaque, backend-specific identifier. Stable within a backend. */
  id: string;
  name: string;
}

export interface Reminder {
  /** Opaque, backend-specific identifier. Stable within a backend. */
  id: string;
  listId: string;
  listName: string;
  title: string;
  notes?: string;
  completed: boolean;
  /** ISO 8601. Present only when completed. */
  completedAt?: string;
  /** ISO 8601. Absent when the reminder has no due date. */
  dueAt?: string;
  /** True when the due date carries no meaningful time-of-day. */
  allDay?: boolean;
  priority: Priority;
  /** Not representable over CalDAV; undefined there rather than false. */
  flagged?: boolean;
  createdAt?: string;
  modifiedAt?: string;
}

/** Relative buckets that save callers from computing date maths themselves. */
export type DueBucket =
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "none"
  | "any";

export interface ReminderQuery {
  /** List name or list id. Omit to search every list. */
  list?: string;
  status?: "open" | "completed" | "all";
  due?: DueBucket;
  /** ISO 8601 upper bound on the due date (exclusive). */
  dueBefore?: string;
  /** ISO 8601 lower bound on the due date (inclusive). */
  dueAfter?: string;
  /** Case-insensitive substring match against title and notes. */
  search?: string;
  limit?: number;
}

export interface CreateReminderInput {
  title: string;
  /** List name or id. Defaults to the backend's default list. */
  list?: string;
  notes?: string;
  /** ISO 8601. */
  dueAt?: string;
  allDay?: boolean;
  priority?: Priority;
  flagged?: boolean;
}

export interface UpdateReminderInput {
  title?: string;
  notes?: string;
  /** ISO 8601, or null to clear the due date. */
  dueAt?: string | null;
  allDay?: boolean;
  priority?: Priority;
  flagged?: boolean;
  completed?: boolean;
}

export interface RemindersBackend {
  readonly name: BackendName;
  /** Throws a descriptive error if this backend cannot be used right now. */
  probe(): Promise<void>;
  listLists(): Promise<ReminderList[]>;
  listReminders(query: ReminderQuery): Promise<Reminder[]>;
  getReminder(id: string): Promise<Reminder | null>;
  createReminder(input: CreateReminderInput): Promise<Reminder>;
  updateReminder(id: string, patch: UpdateReminderInput): Promise<Reminder>;
  deleteReminder(id: string): Promise<void>;
}

/** Raised when a backend is reachable but cannot express what was asked. */
export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedOperationError";
  }
}

/** Raised when a backend cannot be used at all (wrong OS, missing creds...). */
export class BackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export const PRIORITY_TO_ICAL: Record<Priority, number> = {
  none: 0,
  high: 1,
  medium: 5,
  low: 9,
};

/**
 * iCalendar (and the Reminders app) use a 0-9 scale where lower is more
 * urgent. Apple only ever writes 0/1/5/9, but other clients write the full
 * range, so map bands rather than exact values.
 */
export function priorityFromICal(value: number | undefined): Priority {
  if (value === undefined || value === 0 || Number.isNaN(value)) return "none";
  if (value <= 4) return "high";
  if (value === 5) return "medium";
  return "low";
}
