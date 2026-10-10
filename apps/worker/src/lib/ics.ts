/**
 * Calendar files (.ics, RFC 5545) for "Add to calendar" and, from Milestone 3, the booking
 * confirmation email. Times are written in UTC (`...Z`), so they are correct in every calendar app
 * whatever the viewer's time zone or daylight saving.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  startsAtIso: string;
  endsAtIso: string;
  cancelled?: boolean;
  /** time of the last change, for DTSTAMP / LAST-MODIFIED */
  modifiedIso: string;
}

/** `2026-11-14T09:00:00.000Z` to `20261114T090000Z` */
export function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escape text values: backslash, semicolon, comma and line breaks. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line to at most 75 BYTES per line (UTF-8 safe), continuation lines start with a space. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with one space
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zakereh Art//Workshops//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(e.modifiedIso)}`,
    `LAST-MODIFIED:${icsDate(e.modifiedIso)}`,
    `DTSTART:${icsDate(e.startsAtIso)}`,
    `DTEND:${icsDate(e.endsAtIso)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
