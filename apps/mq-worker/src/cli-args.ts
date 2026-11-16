import { toAppError, ValidationError } from "@mono/error-handling";

/** Pure helpers for the queue CLI (`cli.ts`), kept apart so tests can import them. */

const DURATION_UNITS: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
};

/** `500ms`, `30s`, `5m`, `2h`, `1d` or plain milliseconds -> milliseconds. */
export function parseDuration(value: string | undefined, flag = "duration"): number | undefined {
    if (value === undefined) return undefined;
    const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value.trim());
    if (!match) {
        throw new ValidationError(
            `Invalid --${flag} "${value}". Use 500ms, 30s, 5m, 2h, 1d or plain milliseconds.`
        );
    }
    const amount = Number(match[1]) * DURATION_UNITS[match[2] ?? "ms"]!;
    if (!Number.isSafeInteger(amount))
        throw new ValidationError(`--${flag} "${value}" is too large`);
    return amount;
}

/** A whole number flag, or a `ValidationError` naming the flag. */
export function parseInteger(value: string | undefined, flag: string): number | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed))) {
        throw new ValidationError(`--${flag} must be a whole number, got "${value}"`);
    }
    return Number(trimmed);
}

/**
 * A failed command as readable lines for stderr: the message, then one line per invalid field.
 * Zod errors from a service's `parse` are mapped like the API maps them (`toAppError`).
 */
export function formatCliError(error: unknown): string {
    const appError = toAppError(error);
    const lines = [`Error: ${appError.message}`];
    if (appError instanceof ValidationError) {
        for (const issue of appError.issues) {
            lines.push(`  - ${issue.path || "(input)"}: ${issue.message}`);
        }
    }
    return lines.join("\n");
}
