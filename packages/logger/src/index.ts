/* eslint-disable turbo/no-undeclared-env-vars */

import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize } = format;

const logFormat = printf(({ level, message, timestamp }) => `${timestamp} [${level}]: ${message}`);

const logger = createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: combine(
        timestamp(),
        process.env.NODE_ENV !== "production" ? colorize() : format.uncolorize(),
        logFormat
    ),
    transports: [new transports.Console()],
    exitOnError: false,
});

export { Logger } from "winston";
export { logger };
