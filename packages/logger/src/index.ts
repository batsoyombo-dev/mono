import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize, errors, json } = format;

const isProduction = process.env.NODE_ENV === "production";

function serializeMetaValue(value: unknown): unknown {
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
    }
    return value;
}

// JSON.stringify drops an Error's message and stack, so expand errors passed as metadata
// (`logger.error("msg", { error })`) before any formatter serializes them.
const serializeErrors = format((info) => {
    for (const [key, value] of Object.entries(info)) {
        info[key] = serializeMetaValue(value);
    }
    return info;
});

const prettyFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaText = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    const stackText = typeof stack === "string" ? `\n${stack}` : "";
    return `${timestamp} [${level}]: ${message}${metaText}${stackText}`;
});

const logger = createLogger({
    level: process.env.LOG_LEVEL || "info",
    // Production logs are JSON so log collectors can index metadata fields.
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

export type { Logger } from "winston";
export { logger };
