import type { Job } from "bullmq";

import { BadRequestError } from "@mono/error-handling";
import { logger } from "@mono/logger";
import type { MailClient } from "@mono/services/mail";
import type { MailSchemaType } from "@mono/services/queues/schema";

import { isLastAttempt, isPermanentError } from "../retry";
import type { JobDef } from "./job.def";

/** What a redacted context value is replaced with. */
export const REDACTED = "[redacted]";

/**
 * The payload with every `redact` key of `data` replaced by `REDACTED`, or `null` when there is
 * nothing (left) to scrub.
 */
export function redactMailData(data: MailSchemaType): MailSchemaType | null {
    const keys = (data.redact ?? []).filter(
        (key) => Object.hasOwn(data.data, key) && data.data[key] !== REDACTED
    );
    if (keys.length === 0) return null;

    const context = { ...data.data };
    for (const key of keys) context[key] = REDACTED;
    return { ...data, data: context };
}

const wasRedacted = (data: MailSchemaType) =>
    (data.redact ?? []).some((key) => data.data[key] === REDACTED);

/**
 * Scrubs the stored payload. Never throws: after a successful send, a failure here must not fail
 * the job, or a retry would send the email twice.
 */
async function scrub(job: Job<MailSchemaType>): Promise<void> {
    const redacted = redactMailData(job.data);
    if (!redacted) return;
    try {
        await job.updateData(redacted);
        await job.log(`Redacted ${redacted.redact?.join(", ")}`);
    } catch (error) {
        logger.warn("Could not redact mail job data", { error, jobId: job.id });
    }
}

/**
 * Sends a templated email. Context keys listed in `redact` (reset links, tokens) are scrubbed
 * from the job in Redis once it is finished: after a successful send, and after a failure that
 * will not be retried (a permanent error or the last attempt). Until then they stay, because a
 * retry needs them. A redacted job cannot be re-run (for example a manual retry from the
 * dashboard): it fails with a 400 instead of sending "[redacted]" links.
 */
export const createMailJob = (mail: Pick<MailClient, "sendTemplate">): JobDef<MailSchemaType> => ({
    async handle(job) {
        if (wasRedacted(job.data)) {
            throw new BadRequestError(
                "This mail job was redacted after it finished; enqueue a new one"
            );
        }

        await job.log(`Sending "${job.data.template}" to ${job.data.to}`);
        let result: Awaited<ReturnType<typeof mail.sendTemplate>>;
        try {
            result = await mail.sendTemplate(job.data);
        } catch (error) {
            if (isPermanentError(error) || isLastAttempt(job)) await scrub(job);
            throw error;
        }

        await scrub(job);
        return result;
    },
});
