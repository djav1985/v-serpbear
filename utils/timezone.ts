/**
 * The app's time zone. Instants are stored and sent as UTC ISO strings; the time zone only decides which
 * calendar day an instant belongs to ("today" in results, emails, throttling and the UI) and when cron jobs fire.
 * It comes from CRON_TIMEZONE (an IANA name such as "America/New_York"); an unknown name falls back to the default.
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

export const isValidTimezone = (timezone: unknown): timezone is string => {
   if (typeof timezone !== 'string' || timezone.trim() === '') { return false; }
   try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
   } catch {
      return false;
   }
};

export const resolveTimezone = (timezone?: string | null): string => {
   const candidate = (timezone || '').trim();
   return isValidTimezone(candidate) ? candidate : DEFAULT_TIMEZONE;
};

export const APP_TIMEZONE = resolveTimezone(typeof process !== 'undefined' ? process.env?.CRON_TIMEZONE : undefined);

/** Google Search Console reports every day in Pacific Time; the zone cannot be changed. */
export const SEARCH_CONSOLE_TIMEZONE = 'America/Los_Angeles';

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
const partsFormatter = (timezone: string): Intl.DateTimeFormat => {
   let formatter = formatters.get(timezone);
   if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', {
         timeZone: timezone,
         hourCycle: 'h23',
         year: 'numeric',
         month: '2-digit',
         day: '2-digit',
         hour: '2-digit',
         minute: '2-digit',
         second: '2-digit',
      });
      formatters.set(timezone, formatter);
   }
   return formatter;
};

/** The calendar date and clock time of an instant in the given zone (default: the app zone). */
export const zonedDateParts = (date: Date | number | string = new Date(), timezone: string = APP_TIMEZONE): ZonedParts => {
   const instant = date instanceof Date ? date : new Date(date);
   const values: Record<string, number> = {};
   partsFormatter(resolveTimezone(timezone)).formatToParts(instant).forEach((part) => {
      if (part.type !== 'literal') { values[part.type] = Number(part.value); }
   });
   return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
   };
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** "YYYY-MM-DD" for the calendar day an instant falls on in the zone. */
export const dateKeyInZone = (date: Date | number | string = new Date(), timezone: string = APP_TIMEZONE): string => {
   const { year, month, day } = zonedDateParts(date, timezone);
   return `${year}-${pad(month)}-${pad(day)}`;
};

/** Today's "YYYY-MM-DD" in the zone. */
export const todayKey = (timezone: string = APP_TIMEZONE, now: Date = new Date()): string => dateKeyInZone(now, timezone);

/** "YYYY-MM-DD" for the calendar day `days` days before today in the zone (calendar arithmetic, safe across DST). */
export const daysAgoKey = (days: number, timezone: string = APP_TIMEZONE, now: Date = new Date()): string => {
   const { year, month, day } = zonedDateParts(now, timezone);
   const shifted = new Date(Date.UTC(year, month - 1, day - days));
   return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

/** Formats an instant in the zone, e.g. formatInZone(date, { month: 'short', day: 'numeric' }). */
export const formatInZone = (
   date: Date | number | string,
   options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
   timezone: string = APP_TIMEZONE,
   locale: string = 'en-US',
): string => {
   const instant = date instanceof Date ? date : new Date(date);
   if (Number.isNaN(instant.getTime())) { return 'Invalid Date'; }
   return new Intl.DateTimeFormat(locale, { ...options, timeZone: resolveTimezone(timezone) }).format(instant);
};

/** Formats a "YYYY-MM-DD" key as a label without going through a Date in the viewer's own zone. */
export const formatDateKey = (
   key: string,
   options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
   locale: string = 'en-US',
): string => {
   const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
   if (!match) { return key; }
   const noonUtc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
   return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(noonUtc);
};

/** The UTC instant of midnight at the start of a "YYYY-MM-DD" day, used to order and compare day keys. */
export const dateKeyToTime = (key: string): number => {
   const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
   return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(key).getTime();
};
