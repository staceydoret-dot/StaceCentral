/**
 * Date helpers shared by both backends.
 *
 * Reminders are something people talk about in relative terms ("tomorrow",
 * "friday", "in 3 days"), so the tool layer accepts those directly rather than
 * forcing callers to compute an ISO timestamp first. Everything here works in
 * the host machine's local timezone, which is what a user means by "today".
 */

import type { DueBucket, Reminder, ReminderQuery } from "./backends/types.js";

export interface ParsedDate {
  /** ISO 8601 instant. */
  iso: string;
  /** True when the input named a day but no time-of-day. */
  allDay: boolean;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const RELATIVE_UNITS: Record<string, "minute" | "hour" | "day" | "week"> = {
  m: "minute",
  min: "minute",
  mins: "minute",
  minute: "minute",
  minutes: "minute",
  h: "hour",
  hr: "hour",
  hrs: "hour",
  hour: "hour",
  hours: "hour",
  d: "day",
  day: "day",
  days: "day",
  w: "week",
  week: "week",
  weeks: "week",
};

/** Midnight, local time, on the day containing `d`. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function applyTime(base: Date, hours: number, minutes: number): Date {
  const out = new Date(base);
  out.setHours(hours, minutes, 0, 0);
  return out;
}

/**
 * Pulls a trailing time-of-day off an expression like "tomorrow 5pm" or
 * "friday at 17:30". Returns the remaining text plus the time, if any.
 */
function extractTime(
  text: string,
): { rest: string; hours: number; minutes: number } | { rest: string } {
  // Leading whitespace is optional so a bare "5pm" matches with an empty rest.
  const match = text.match(
    /(?:^|\s+)(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i,
  );
  if (!match) return { rest: text };

  const rawHour = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  // A bare 1-2 digit number with no colon and no am/pm is ambiguous with a
  // day-of-month ("june 5"), so only treat it as a time when it looks like one.
  if (!match[2] && !meridiem) return { rest: text };
  if (rawHour > 23 || minutes > 59) return { rest: text };

  let hours = rawHour;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23) return { rest: text };

  return { rest: text.slice(0, match.index).trim(), hours, minutes };
}

/**
 * Parses ISO timestamps and the small set of relative phrases people actually
 * use for reminders. Returns null when the input isn't understood, so callers
 * can surface a helpful error instead of silently guessing a date.
 */
export function parseDateInput(input: string, now = new Date()): ParsedDate | null {
  const raw = input.trim();
  if (!raw) return null;

  // Date-only ISO: treat as all-day at local midnight, not UTC midnight, so
  // "2026-09-11" doesn't land on the 10th for anyone west of Greenwich.
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const d = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
    if (Number.isNaN(d.getTime())) return null;
    return { iso: d.toISOString(), allDay: true };
  }

  // Full ISO 8601 with a time component.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return { iso: d.toISOString(), allDay: false };
  }

  const lower = raw.toLowerCase();

  // "+3d", "in 3 days", "3 days from now"
  const relative = lower.match(
    /^(?:in\s+)?\+?(\d+)\s*([a-z]+)(?:\s+from\s+now)?$/,
  );
  if (relative) {
    const amount = Number(relative[1]);
    const unit = RELATIVE_UNITS[relative[2] ?? ""];
    if (unit) {
      const d = new Date(now);
      if (unit === "minute") d.setMinutes(d.getMinutes() + amount);
      if (unit === "hour") d.setHours(d.getHours() + amount);
      if (unit === "day") d.setDate(d.getDate() + amount);
      if (unit === "week") d.setDate(d.getDate() + amount * 7);
      // Day and week offsets name a day, not a moment; times do the opposite.
      const allDay = unit === "day" || unit === "week";
      return {
        iso: (allDay ? startOfDay(d) : d).toISOString(),
        allDay,
      };
    }
  }

  const timed = extractTime(lower);
  const hasTime = "hours" in timed;
  const base = timed.rest.replace(/^(?:on|this)\s+/, "").trim();

  const dayOffsets: Record<string, number> = {
    today: 0,
    tonight: 0,
    tomorrow: 1,
    yesterday: -1,
  };

  let day: Date | null = null;

  if (base in dayOffsets) {
    day = startOfDay(addDays(now, dayOffsets[base] as number));
    // "tonight" with no explicit time means the evening, not midnight.
    if (base === "tonight" && !hasTime) {
      return { iso: applyTime(day, 20, 0).toISOString(), allDay: false };
    }
  } else if (base === "next week") {
    day = startOfDay(addDays(now, 7));
  } else {
    const weekdayMatch = base.match(/^(?:(next)\s+)?([a-z]+)$/);
    const weekdayName = weekdayMatch?.[2] ?? "";
    if (weekdayName in WEEKDAYS) {
      const target = WEEKDAYS[weekdayName] as number;
      const current = now.getDay();
      // Always look forward: a weekday name never means a day in the past.
      let delta = (target - current + 7) % 7;
      if (delta === 0) delta = 7;
      if (weekdayMatch?.[1] === "next" && delta < 7) delta += 7;
      day = startOfDay(addDays(now, delta));
    }
  }

  // A bare time with no day ("5pm") means today, rolling to tomorrow if past.
  if (!day && hasTime && base === "") {
    let candidate = applyTime(now, timed.hours, timed.minutes);
    if (candidate.getTime() <= now.getTime()) candidate = addDays(candidate, 1);
    return { iso: candidate.toISOString(), allDay: false };
  }

  if (!day) return null;

  if (hasTime) {
    return { iso: applyTime(day, timed.hours, timed.minutes).toISOString(), allDay: false };
  }
  return { iso: day.toISOString(), allDay: true };
}

/** Resolves a relative bucket into a concrete half-open [start, end) window. */
export function bucketRange(
  bucket: Exclude<DueBucket, "none" | "any">,
  now = new Date(),
): { start?: Date; end?: Date } {
  const today = startOfDay(now);
  switch (bucket) {
    case "overdue":
      return { end: now };
    case "today":
      return { start: today, end: addDays(today, 1) };
    case "tomorrow":
      return { start: addDays(today, 1), end: addDays(today, 2) };
    case "week":
      return { start: today, end: addDays(today, 7) };
  }
}

/**
 * Applies the parts of a query that backends don't push down natively. Both
 * backends run every result through this, so filtering semantics stay
 * identical no matter which one is active.
 */
export function applyQueryFilters(
  reminders: Reminder[],
  query: ReminderQuery,
  now = new Date(),
): Reminder[] {
  const status = query.status ?? "open";
  let out = reminders;

  if (status !== "all") {
    const wantCompleted = status === "completed";
    out = out.filter((r) => r.completed === wantCompleted);
  }

  if (query.list) {
    const needle = query.list.toLowerCase();
    out = out.filter(
      (r) => r.listId === query.list || r.listName.toLowerCase() === needle,
    );
  }

  const bucket = query.due;
  if (bucket === "none") {
    out = out.filter((r) => !r.dueAt);
  } else if (bucket && bucket !== "any") {
    const { start, end } = bucketRange(bucket, now);
    out = out.filter((r) => {
      if (!r.dueAt) return false;
      const due = new Date(r.dueAt).getTime();
      if (start && due < start.getTime()) return false;
      if (end && due >= end.getTime()) return false;
      return true;
    });
  }

  if (query.dueAfter) {
    const after = new Date(query.dueAfter).getTime();
    out = out.filter((r) => r.dueAt !== undefined && new Date(r.dueAt).getTime() >= after);
  }
  if (query.dueBefore) {
    const before = new Date(query.dueBefore).getTime();
    out = out.filter((r) => r.dueAt !== undefined && new Date(r.dueAt).getTime() < before);
  }

  if (query.search) {
    const needle = query.search.toLowerCase();
    out = out.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        (r.notes ?? "").toLowerCase().includes(needle),
    );
  }

  // Soonest first, undated last — the order someone actually wants to read.
  out = [...out].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return a.title.localeCompare(b.title);
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  if (query.limit !== undefined && query.limit >= 0) {
    out = out.slice(0, query.limit);
  }
  return out;
}
