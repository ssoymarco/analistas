/**
 * Time-format utilities
 *
 * • formatMatchTime  — converts a pre-formatted "HH:MM" string (as stored in
 *   Match.time) into the user's preferred 12 h / 24 h format.  Any other
 *   string ("45'", "HT", "FT", "") is returned unchanged.
 *
 * • formatUtcTime   — accepts an ISO-8601 or SportMonks "YYYY-MM-DD HH:MM:SS"
 *   UTC string, converts to the device local timezone, then formats as 12 h
 *   or 24 h.  Used by LeagueDetailScreen and any other place that works with
 *   raw UTC timestamps rather than the pre-formatted Match.time string.
 *
 * • detectDeviceTimeFormat — reads the device/OS preference (12 h vs 24 h).
 */

export type TimeFormat = '12h' | '24h';

/** Convert a "HH:MM" string to the requested format.  Non-time strings pass through. */
export function formatMatchTime(time: string, format: TimeFormat): string {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return time; // "45'", "HT", "FT", "", …

  const h = parseInt(m[1], 10);
  const min = m[2];

  if (format === '12h') {
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${min} ${period}`;
  }

  // 24 h — ensure two-digit hour even if the original lacked it
  return `${h.toString().padStart(2, '0')}:${min}`;
}

/** Convert a UTC date-string to local time in the requested format. */
export function formatUtcTime(dateStr: string, format: TimeFormat): string {
  try {
    // SportMonks uses "YYYY-MM-DD HH:MM:SS"; make it ISO-parseable
    const iso = dateStr.replace(' ', 'T').replace(/Z?$/, 'Z');
    const d = new Date(iso);
    if (isNaN(d.getTime())) return dateStr;

    const h = d.getHours();
    const min = d.getMinutes().toString().padStart(2, '0');

    if (format === '12h') {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${min} ${period}`;
    }

    return `${h.toString().padStart(2, '0')}:${min}`;
  } catch {
    return dateStr;
  }
}

/**
 * Detect whether the device / OS is configured for 12-hour or 24-hour time.
 *
 * Strategy: format a Date whose hour is 13 (1 PM).  If the output contains
 * "AM" or "PM" the device is in 12-hour mode; otherwise 24-hour.
 */
export function detectDeviceTimeFormat(): TimeFormat {
  try {
    const probe = new Date(2000, 0, 1, 13, 0, 0); // 1 PM — unambiguous
    const formatted = probe.toLocaleTimeString([], { hour: 'numeric' });
    return /[AP]M/i.test(formatted) ? '12h' : '24h';
  } catch {
    return '24h';
  }
}
