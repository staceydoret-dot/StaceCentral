/**
 * A small iCalendar (RFC 5545) reader/writer, scoped to the VTODO component
 * that Reminders uses over CalDAV.
 *
 * Updates deliberately rewrite individual property lines in place rather than
 * regenerating the component. Apple stores a fair amount of its own state in
 * X-APPLE-* properties, and a naive regenerate-and-PUT silently destroys it.
 */

export interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Undoes RFC 5545 line folding: a CRLF followed by a space or tab. */
function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

/** Folds long lines back to 75 octets, as required when writing. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

export function unescapeText(value: string): string {
  // Single pass: a multi-pass replace would turn a literal backslash followed
  // by "n" (written "\\\\n") into a newline instead of a backslash and an "n".
  return value.replace(/\\([\\;,nN])/g, (_match, ch: string) =>
    ch === "n" || ch === "N" ? "\n" : ch,
  );
}

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function parseLine(line: string): IcsProperty | null {
  // The name/params section ends at the first colon that isn't inside quotes.
  let colon = -1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = head.split(";");
  const name = (segments.shift() ?? "").toUpperCase();

  const params: Record<string, string> = {};
  for (const segment of segments) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    params[segment.slice(0, eq).toUpperCase()] = segment
      .slice(eq + 1)
      .replace(/^"|"$/g, "");
  }
  return { name, params, value };
}

/** Splits a full calendar document into the lines of its first VTODO. */
export function vtodoLines(ics: string): string[] {
  const lines = unfold(ics).split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toUpperCase() === "BEGIN:VTODO");
  if (start === -1) return [];
  const end = lines.findIndex(
    (l, i) => i > start && l.trim().toUpperCase() === "END:VTODO",
  );
  if (end === -1) return [];
  return lines.slice(start + 1, end);
}

export function parseVTodo(ics: string): IcsProperty[] {
  return vtodoLines(ics)
    .map(parseLine)
    .filter((p): p is IcsProperty => p !== null);
}

export function getProperty(
  props: IcsProperty[],
  name: string,
): IcsProperty | undefined {
  return props.find((p) => p.name === name.toUpperCase());
}

/**
 * Converts a DATE or DATE-TIME value to an instant.
 *
 * A floating DATE-TIME (no Z, no TZID) is interpreted in local time, which is
 * what Apple means by it. A bare DATE is an all-day value and anchors to local
 * midnight so it doesn't drift across the date line.
 */
export function parseIcsDate(prop: IcsProperty): { iso: string; allDay: boolean } | null {
  const value = prop.value.trim();

  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const d = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
    return Number.isNaN(d.getTime()) ? null : { iso: d.toISOString(), allDay: true };
  }

  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!dateTime) return null;

  const [, y, mo, da, h, mi, s, zulu] = dateTime;
  const parts = [y, mo, da, h, mi, s].map(Number) as [
    number, number, number, number, number, number,
  ];

  if (zulu) {
    const d = new Date(
      Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]),
    );
    return { iso: d.toISOString(), allDay: false };
  }

  // TZID-qualified values would need a full tz database to resolve exactly.
  // Treating them as local time is correct for the overwhelmingly common case
  // where the reminder was created in the same timezone it's being read in.
  const d = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  return Number.isNaN(d.getTime()) ? null : { iso: d.toISOString(), allDay: false };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Formats an instant as a UTC DATE-TIME, which every CalDAV server accepts. */
export function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Formats an instant as a local-calendar DATE, for all-day values. */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * Rewrites properties inside the document's VTODO, leaving every other line —
 * including Apple's proprietary extensions — exactly as it was found.
 *
 * A value of null removes the property; a missing key leaves it untouched.
 */
export function patchVTodo(
  ics: string,
  changes: Record<string, string | null>,
): string {
  const lines = unfold(ics).split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toUpperCase() === "BEGIN:VTODO");
  const end = lines.findIndex(
    (l, i) => i > start && l.trim().toUpperCase() === "END:VTODO",
  );
  if (start === -1 || end === -1) {
    throw new Error("Calendar object does not contain a VTODO component.");
  }

  const body = lines.slice(start + 1, end);
  const pending = new Map(Object.entries(changes));
  const rewritten: string[] = [];

  for (const line of body) {
    const parsed = parseLine(line);
    if (!parsed || !pending.has(parsed.name)) {
      rewritten.push(line);
      continue;
    }
    const replacement = pending.get(parsed.name);
    pending.delete(parsed.name);
    // null removes the property; anything else replaces the whole line.
    if (replacement !== null && replacement !== undefined) {
      rewritten.push(replacement);
    }
  }

  // Anything that wasn't already present and isn't a deletion gets appended.
  for (const [, replacement] of pending) {
    if (replacement !== null && replacement !== undefined) {
      rewritten.push(replacement);
    }
  }

  const out = [
    ...lines.slice(0, start + 1),
    ...rewritten,
    ...lines.slice(end),
  ];
  return out.map(fold).join("\r\n");
}

/** Builds a complete calendar document for a brand-new todo. */
export function buildVTodo(props: {
  uid: string;
  summary: string;
  description?: string;
  due?: string;
  priority: number;
  completed: boolean;
}): string {
  const now = formatUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StaceCentral//Apple Reminders MCP//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTODO",
    `UID:${props.uid}`,
    `DTSTAMP:${now}`,
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    `SUMMARY:${escapeText(props.summary)}`,
  ];
  if (props.description) {
    lines.push(`DESCRIPTION:${escapeText(props.description)}`);
  }
  if (props.due) lines.push(props.due);
  lines.push(`PRIORITY:${props.priority}`);
  lines.push(`STATUS:${props.completed ? "COMPLETED" : "NEEDS-ACTION"}`);
  if (props.completed) {
    lines.push(`COMPLETED:${now}`);
    lines.push("PERCENT-COMPLETE:100");
  }
  lines.push("END:VTODO", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Renders the DUE line for an instant, honouring all-day semantics. */
export function dueLine(iso: string, allDay: boolean): string {
  const date = new Date(iso);
  return allDay
    ? `DUE;VALUE=DATE:${formatDate(date)}`
    : `DUE:${formatUtc(date)}`;
}
