import { BadRequestError } from "@mono/error-handling";
import type { MailClient } from "@mono/services/mail";
import type { MailSchemaType } from "@mono/services/queues/schema";

import type { JobDef } from "./job.def";

/** What a redacted context value is replaced with. */
export const REDACTED = "[redacted]";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The stored payload with every `redact` key of `data` replaced by `REDACTED`, or `null` when
 * there is nothing (left) to scrub. Takes the raw stored payload, which may be invalid.
 */
export function redactMailData(stored: unknown): unknown {
    if (!isRecord(stored) || !isRecord(stored.data) || !Array.isArray(stored.redact)) {
        return null;
    }
    const context = stored.data;
    const keys = stored.redact.filter(
        (key): key is string =>
            typeof key === "string" && Object.hasOwn(context, key) && context[key] !== REDACTED
    );
    if (keys.length === 0) return null;

    const scrubbed = { ...context };
    for (const key of keys) scrubbed[key] = REDACTED;
    return { ...stored, data: scrubbed };
}

const wasRedacted = (data: MailSchemaType) =>
    (data.redact ?? []).some((key) => data.data[key] === REDACTED);

/**
 * Sends a templated email. Context keys listed in `redact` (reset links, tokens) are scrubbed
 * from the job in Redis once it is finished (see `redact` on `JobDef`; the processor does it).
 * Until then they stay, because a retry needs them. A redacted job cannot be re-run (for example
 * a manual retry from the dashboard): it fails with a 400 instead of sending "[redacted]" links.
 */
export const createMailJob = (mail: Pick<MailClient, "sendTemplate">): JobDef<MailSchemaType> => ({
    async handle(job) {
        if (wasRedacted(job.data)) {
            throw new BadRequestError(
                "This mail job was redacted after it finished; enqueue a new one"
            );
        }

        await job.log(`Sending "${job.data.template}" to ${job.data.to}`);
        return mail.sendTemplate(job.data);
    },
    redact: redactMailData,
});
