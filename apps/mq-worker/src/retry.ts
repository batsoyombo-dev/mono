import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";

import { toAppError } from "@mono/error-handling";

/**
 * 4xx statuses a later attempt can still fix: a timeout (408), a conflict such as an optimistic
 * lock or a race (409), and rate limiting (429).
 */
const RETRYABLE_CLIENT_STATUSES: ReadonlySet<number> = new Set([408, 409, 429]);

/** Client errors that a retry cannot fix: bad input, a missing record, no permission. */
export function isPermanentStatus(status: number): boolean {
    return status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status);
}

const isUnrecoverable = (error: unknown): error is UnrecoverableError =>
    error instanceof UnrecoverableError ||
    (error instanceof Error && error.name === "UnrecoverableError");

/** True when BullMQ will not retry a job that failed with `error`, whatever its attempts. */
export function isPermanentError(error: unknown): boolean {
    return isUnrecoverable(error) || isPermanentStatus(toAppError(error).statusCode);
}

/** True when this run is the job's last allowed attempt. */
export function isLastAttempt(job: Pick<Job, "attemptsMade" | "opts">): boolean {
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

/**
 * Wraps a permanent error in BullMQ's `UnrecoverableError`, so the job fails without retrying.
 * The original error is kept as `cause` and its stack is copied, so the job's stacktrace in the
 * dashboard still points at the code that threw. Returns `null` for errors worth retrying.
 */
export function toUnrecoverable(error: unknown): UnrecoverableError | null {
    if (isUnrecoverable(error)) return error;

    const appError = toAppError(error);
    if (!isPermanentStatus(appError.statusCode)) return null;

    const wrapped = new UnrecoverableError(`${appError.name}: ${appError.message}`);
    wrapped.cause = error;
    if (error instanceof Error && error.stack) wrapped.stack = error.stack;
    return wrapped;
}
