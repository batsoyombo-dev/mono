import { runtimeConfig } from "@mono/env/runtime";
import { configure } from "safe-stable-stringify";
import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize, errors, json } = format;

const isProduction = runtimeConfig.NODE_ENV === "production";

// Never throws: circular references become "[Circular]" and BigInts become strings.
const stringify = configure({ circularValue: "[Circular]", deterministic: false });
const bigintToString = (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value;
const safeStringify = (value: unknown): string => stringify(value, bigintToString) ?? "";

/** Max depth for expanding nested errors and their `cause` chains. */
const MAX_ERROR_DEPTH = 5;

/**
 * Turns `Error`s anywhere in a log metadata value into plain objects (`name`, `message`, `stack`,
 * `cause` and own enumerable fields such as `status`, `code` or `issues`), because
 * `JSON.stringify` drops an Error's message and stack. Recurses into arrays and plain objects;
 * cycles are left for the stringifier to mark as `[Circular]`. BigInts become strings.
 */
export function serializeMetaValue(
    value: unknown,
    depth = 0,
    seen = new WeakSet<object>()
): unknown {
    if (typeof value === "bigint") return value.toString();
    if (typeof value !== "object" || value === null) return value;
    if (seen.has(value) || depth > MAX_ERROR_DEPTH) return value;

    if (value instanceof Error) {
        seen.add(value);
        const result: Record<string, unknown> = {};
        for (const [key, field] of Object.entries(value)) {
            result[key] = serializeMetaValue(field, depth + 1, seen);
        }
        result.name = value.name;
        result.message = value.message;
        result.stack = value.stack;
        if (value.cause !== undefined) {
            result.cause = serializeMetaValue(value.cause, depth + 1, seen);
        }
        return result;
    }

    if (Array.isArray(value)) {
        seen.add(value);
        return value.map((item) => serializeMetaValue(item, depth + 1, seen));
    }

    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto === Object.prototype || proto === null) {
        seen.add(value);
        const result: Record<string, unknown> = {};
        for (const [key, field] of Object.entries(value)) {
            result[key] = serializeMetaValue(field, depth + 1, seen);
        }
        return result;
    }

    // Dates, Maps, class instances: leave them to the formatter.
    return value;
}

// Expand errors passed as metadata (`logger.error("msg", { error })`) before any formatter
// serializes them. Winston keeps `level` and `message` on the same object, so only own
// enumerable string keys are rewritten.
const serializeErrors = format((info) => {
    for (const [key, value] of Object.entries(info)) {
        info[key] = serializeMetaValue(value);
    }
    return info;
});

/** Renders the dev/test line. Exported for tests. */
export function formatPrettyLine(info: Record<string, unknown>): string {
    const { level, message, timestamp, stack, ...meta } = info;
    const metaText = Object.keys(meta).length ? ` ${safeStringify(meta)}` : "";
    const stackText = typeof stack === "string" ? `\n${stack}` : "";
    return `${String(timestamp)} [${String(level)}]: ${String(message)}${metaText}${stackText}`;
}

const prettyFormat = printf((info) => formatPrettyLine(info));

const logger = createLogger({
    level: runtimeConfig.LOG_LEVEL,
    // Production logs are JSON so log collectors can index metadata fields. Winston's `json`
    // format already uses safe-stable-stringify; BigInts are converted by `serializeErrors`.
    format: isProduction
        ? combine(errors({ stack: true }), serializeErrors(), timestamp(), json())
        : combine(
              errors({ stack: true }),
              serializeErrors(),
              timestamp(),
              colorize(),
              prettyFormat
          ),
    transports: [new transports.Console()],
    exitOnError: false,
});

/**
 * Sends every log level to stderr, keeping stdout free for machine-readable output
 * (for example JSON printed by a CLI).
 */
function redirectLogsToStderr(): void {
    logger.clear().add(new transports.Console({ stderrLevels: Object.keys(logger.levels) }));
}

export type { Logger } from "winston";
export { logger, redirectLogsToStderr };
