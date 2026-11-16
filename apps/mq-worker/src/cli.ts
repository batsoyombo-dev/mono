/**
 * Queue operations from the terminal: inspect jobs, trigger jobs and schedules, retry, pause.
 * Prints JSON to stdout; logs go to stderr. Exit code 1 on failure.
 *
 *   bun run queue help
 */
// Validate the environment before any package that reads it is loaded.
import "./config";

import { parseArgs } from "node:util";

import { AppError, ValidationError } from "@mono/error-handling";
import { logger, redirectLogsToStderr } from "@mono/logger";
import { closeServices } from "@mono/services/lifecycle";
import { queueService } from "@mono/services/queue";
import type { Queues } from "@mono/services/queues";
import { QueueNameSchema } from "@mono/services/queues";

redirectLogsToStderr();

const USAGE = `Usage: bun run queue <command> [args] [options]

Commands
  stats [queue]                        Job counts, paused state and schedules (all queues by default)
  jobs <queue> [--status s] [--page n] [--page-size n]
                                       Recent jobs, newest first (status default: completed;
                                       waiting|active|delayed|prioritized|completed|failed|waiting-children)
  job <queue> <jobId>                  Job detail: payload, attempts, error, stacktrace, logs
  add <queue> <name> [json] [--delay 10s] [--priority n] [--job-id id]
                                       Enqueue a job manually (payload validated)
  trigger <queue> <scheduleId>         Run a cron schedule now
  retry <queue> <jobId>                Retry a failed or completed job
  retry-failed <queue>                 Retry every failed job
  promote <queue> <jobId>              Run a delayed job now
  remove <queue> <jobId>               Delete a job (not while active)
  pause <queue> | resume <queue>       Stop or restart processing
  clean <queue> --status completed|failed [--older-than 1d] [--limit n]
                                       Delete finished jobs

Durations: 500ms, 30s, 5m, 2h, 1d, or plain milliseconds.`;

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        status: { type: "string" },
        page: { type: "string" },
        "page-size": { type: "string" },
        delay: { type: "string" },
        priority: { type: "string" },
        "job-id": { type: "string" },
        "older-than": { type: "string" },
        limit: { type: "string" },
    },
});

const DURATION_UNITS: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
};

function duration(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value.trim());
    if (!match) throw new ValidationError(`Invalid duration "${value}"`);
    return Number(match[1]) * DURATION_UNITS[match[2] ?? "ms"]!;
}

const int = (value: string | undefined) => (value === undefined ? undefined : Number(value));

function arg(index: number, name: string): string {
    const value = positionals[index];
    if (!value) throw new ValidationError(`Missing <${name}>.\n\n${USAGE}`);
    return value;
}

function queueArg(index = 1): Queues {
    const value = arg(index, "queue");
    const result = QueueNameSchema.safeParse(value);
    if (!result.success) {
        throw new ValidationError(
            `Unknown queue "${value}". Queues: ${QueueNameSchema.options.join(", ")}`
        );
    }
    return result.data;
}

function json(value: string | undefined): unknown {
    if (value === undefined) return {};
    try {
        return JSON.parse(value);
    } catch {
        throw new ValidationError(`Payload is not valid JSON: ${value}`);
    }
}

const actor = { actorUserId: null };

async function run(command: string | undefined): Promise<unknown> {
    switch (command) {
        case "stats": {
            const all = await queueService.overview(actor);
            return positionals[1] ? all.filter((queue) => queue.name === queueArg()) : all;
        }
        case "jobs":
            return queueService.listJobs({
                ...actor,
                queue: queueArg(),
                status: values.status as never,
                page: int(values.page),
                pageSize: int(values["page-size"]),
            });
        case "job":
            return queueService.getJob({ ...actor, queue: queueArg(), jobId: arg(2, "jobId") });
        case "add":
            return queueService.enqueueJob({
                ...actor,
                queue: queueArg(),
                name: arg(2, "name"),
                data: json(positionals[3]),
                delayMs: duration(values.delay),
                priority: int(values.priority),
                jobId: values["job-id"],
            });
        case "trigger":
            return queueService.triggerSchedule({
                ...actor,
                queue: queueArg(),
                scheduleId: arg(2, "scheduleId"),
            });
        case "retry":
            return queueService.retryJob({ ...actor, queue: queueArg(), jobId: arg(2, "jobId") });
        case "retry-failed":
            return queueService.retryFailed({ ...actor, queue: queueArg() });
        case "promote":
            return queueService.promoteJob({ ...actor, queue: queueArg(), jobId: arg(2, "jobId") });
        case "remove":
            return queueService.removeJob({ ...actor, queue: queueArg(), jobId: arg(2, "jobId") });
        case "pause":
            return queueService.pause({ ...actor, queue: queueArg() });
        case "resume":
            return queueService.resume({ ...actor, queue: queueArg() });
        case "clean":
            return queueService.clean({
                ...actor,
                queue: queueArg(),
                status: values.status as never,
                olderThanMs: duration(values["older-than"]),
                limit: int(values.limit),
            });
        default:
            throw new ValidationError(
                command && command !== "help" ? `Unknown command "${command}".\n\n${USAGE}` : USAGE
            );
    }
}

const command = positionals[0];
let exitCode = 0;

try {
    const result = await run(command);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
    if (command === undefined || command === "help") {
        process.stdout.write(`${USAGE}\n`);
    } else {
        exitCode = 1;
        const output =
            error instanceof ValidationError
                ? { error: error.message, issues: error.issues }
                : { error: error instanceof Error ? error.message : String(error) };
        process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
        if (!(error instanceof AppError)) logger.error("Queue command failed", { error });
    }
} finally {
    await closeServices();
}

process.exit(exitCode);
