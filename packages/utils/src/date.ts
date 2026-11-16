/**
 * Date helpers built on date-fns. Formatting and start/end-of-day helpers use the process
 * timezone, so run servers with TZ=UTC (see .env.example) and convert to a user's timezone at
 * the edge. ISO strings are parsed with parseISO.
 */
import type { Duration, StartOfWeekOptions } from "date-fns";
import {
    add,
    addDays,
    addMonths,
    addYears,
    differenceInDays,
    differenceInHours,
    endOfDay,
    endOfMonth,
    endOfWeek,
    endOfYear,
    format,
    formatDistanceToNow,
    isValid,
    parseISO,
    startOfDay,
    startOfMonth,
    startOfWeek,
    startOfYear,
    sub,
    subDays,
    subMonths,
    subYears,
} from "date-fns";

export const formatPatterns = {
    dateTime: "yyyy MMM dd HH:mm", // 2022 Apr 17 13:00
    date: "yyyy MMM dd", // 2022 Apr 17
    time: "HH:mm", // 13:00
    split: {
        dateTime: "yyyy/MM/dd HH:mm", // 2022/04/17 13:00
        date: "yyyy/MM/dd", // 2022/04/17
    },
    paramCase: {
        dateTime: "yyyy-MM-dd HH:mm", // 2022-04-17 13:00
        date: "yyyy-MM-dd", // 2022-04-17
    },
};

/**
 * Formats a Date or ISO‐string into a given pattern.
 * @param date Date object or ISO string.
 * @param pattern date-fns format string (default yyyy-MM-dd).
 */
export function formatDate(date: Date | string, pattern = "yyyy-MM-dd"): string {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, pattern);
}

/**
 * Formats date and time as 'yyyy-MM-dd HH:mm:ss'.
 * @param date Date object or ISO string.
 */
export function formatDateTime(date: Date | string): string {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, "yyyy-MM-dd HH:mm:ss");
}

/**
 * Formats a date and time in a human-readable format, e.g. '2025 Jun 13 8:00 AM'.
 */
export function formatHumanDateTime(date: Date | string): string {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, "yyyy MMM dd p");
}

/**
 * Formats a date and time in a long human-readable format, e.g. 'June 13th, 2025 8:00 AM'.
 */
export function formatHumanDateTimeDetailed(date: Date | string): string {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, "PPP p");
}

/**
 * Parses an ISO string into a Date object.
 * @param isoString date in ISO format.
 */
export function parseDate(isoString: string): Date {
    return parseISO(isoString);
}

/**
 * Adds days to a date.
 */
export function addDaysToDate(date: Date | string, days: number): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return addDays(d, days);
}

/**
 * Adds duration to a date.
 */
export function addToDate(date: Date | string, duration: Duration): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return add(d, duration);
}

/**
 * Subtracts duration from a date.
 */
export function subtractFromDate(date: Date | string, duration: Duration): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return sub(d, duration);
}

/**
 * Subtracts days from a date.
 */
export function subtractDays(date: Date | string, days: number): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return subDays(d, days);
}

/**
 * Adds months to a date.
 */
export function addMonthsToDate(date: Date | string, months: number): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return addMonths(d, months);
}

/**
 * Subtracts months from a date.
 */
export function subtractMonths(date: Date | string, months: number): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return subMonths(d, months);
}

/**
 * Adds years to a date.
 */
export function addYearsToDate(date: Date | string, years: number): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return addYears(d, years);
}

/**
 * Subtracts years from a date.
 */
export function subtractYears(date: Date | string, years: number): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return subYears(d, years);
}

/**
 * Calculates difference in days between two dates.
 */
export function differenceInDaysBetween(dateLeft: Date | string, dateRight: Date | string): number {
    const dl = typeof dateLeft === "string" ? parseISO(dateLeft) : dateLeft;
    const dr = typeof dateRight === "string" ? parseISO(dateRight) : dateRight;
    return differenceInDays(dl, dr);
}

/**
 * Calculates difference in hours between two dates.
 */
export function differenceInHoursBetween(
    dateLeft: Date | string,
    dateRight: Date | string
): number {
    const dl = typeof dateLeft === "string" ? parseISO(dateLeft) : dateLeft;
    const dr = typeof dateRight === "string" ? parseISO(dateRight) : dateRight;
    return differenceInHours(dl, dr);
}

/**
 * Returns the start of day for the given date.
 */
export function getStartOfDay(date: Date | string): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return startOfDay(d);
}

/**
 * Returns the end of day for the given date.
 */
export function getEndOfDay(date: Date | string): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return endOfDay(d);
}

/**
 * Returns the start of week for the given date.
 */
export function getStartOfWeek(date: Date | string, options?: StartOfWeekOptions): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return startOfWeek(d, options);
}

/**
 * Returns the end of week for the given date.
 */
export function getEndOfWeek(date: Date | string): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return endOfWeek(d);
}

/**
 * Returns the start of month for the given date.
 */
export function getStartOfMonth(date: Date | string): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return startOfMonth(d);
}

/**
 * Returns the end of month for the given date.
 */
export function getEndOfMonth(date: Date | string): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return endOfMonth(d);
}

/**
 * Returns the start of year for the given date.
 */
export function getStartOfYear(date: Date | string): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return startOfYear(d);
}

/**
 * Returns the end of year for the given date.
 */
export function getEndOfYear(date: Date | string): Date {
    const d = typeof date === "string" ? parseISO(date) : date;
    return endOfYear(d);
}

/**
 * Formats a date as 'yyyy-MM-dd'.
 */
export function formatShortDate(date: Date | string): string {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, "yyyy-MM-dd");
}

/**
 * Formats time as 'HH:mm:ss'.
 */
export function formatShortTime(date: Date | string): string {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, "HH:mm:ss");
}

/**
 * Returns human-readable distance to now, e.g., '3 days ago'.
 */
export function timeSince(date: Date | string): string {
    const d = typeof date === "string" ? parseISO(date) : date;
    return formatDistanceToNow(d, { addSuffix: true });
}

const isIsoDate = (val: unknown) => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(String(val));

/**
 * Returns if the given string is date
 */
export const isValidDateString = (str: unknown) => {
    if (isIsoDate(str)) {
        const parsed = parseISO(String(str));
        return isValid(parsed);
    }

    return false;
};

export { parseISO };
