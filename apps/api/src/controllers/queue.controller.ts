import { Elysia } from "elysia";

import {
    cleanJobsSchema,
    enqueueJobSchema,
    jobParamsSchema,
    listJobsQuerySchema,
    queueParamsSchema,
    scheduleParamsSchema,
} from "@mono/services/queue/schema";
import type { QueueOperations } from "@mono/services/queue/types";

import type { AdminAccess } from "./session-guard";
import { getAuthorizedAdminUserId } from "./session-guard";
import { success } from "../utils/response";

type QueueControllerOptions = AdminAccess & {
    queues: QueueOperations;
};

/** Admin-only queue operations: inspect jobs, trigger jobs and schedules, retry, pause. */
export function createQueueController({ queues, ...access }: QueueControllerOptions) {
    return (
        new Elysia({
            prefix: "/admin/queues",
            name: "AdminQueues",
            detail: { tags: ["admin"] },
        })
            // derive runs after the body is parsed but before it is validated: an unauthenticated
            // or non-admin call gets 401/403 rather than 422 (a malformed JSON body is still 400).
            .derive(async ({ request }) => ({
                actorUserId: await getAuthorizedAdminUserId(access, request),
            }))
            .get("/", async ({ actorUserId }) =>
                success({ queues: await queues.overview({ actorUserId }) })
            )
            .get(
                "/:queue/jobs",
                async ({ actorUserId, params, query }) =>
                    success(await queues.listJobs({ ...query, queue: params.queue, actorUserId })),
                { params: queueParamsSchema, query: listJobsQuerySchema }
            )
            .get(
                "/:queue/jobs/:jobId",
                async ({ actorUserId, params }) =>
                    success({ job: await queues.getJob({ ...params, actorUserId }) }),
                { params: jobParamsSchema }
            )
            .post(
                "/:queue/jobs",
                async ({ actorUserId, params, body }) =>
                    success({
                        job: await queues.enqueueJob({ ...body, queue: params.queue, actorUserId }),
                    }),
                { params: queueParamsSchema, body: enqueueJobSchema }
            )
            .post(
                "/:queue/schedules/:scheduleId/trigger",
                async ({ actorUserId, params }) =>
                    success({ job: await queues.triggerSchedule({ ...params, actorUserId }) }),
                { params: scheduleParamsSchema }
            )
            .post(
                "/:queue/jobs/:jobId/retry",
                async ({ actorUserId, params }) =>
                    success(await queues.retryJob({ ...params, actorUserId })),
                { params: jobParamsSchema }
            )
            .post(
                "/:queue/jobs/:jobId/promote",
                async ({ actorUserId, params }) =>
                    success(await queues.promoteJob({ ...params, actorUserId })),
                { params: jobParamsSchema }
            )
            .delete(
                "/:queue/jobs/:jobId",
                async ({ actorUserId, params }) =>
                    success(await queues.removeJob({ ...params, actorUserId })),
                { params: jobParamsSchema }
            )
            .post(
                "/:queue/retry-failed",
                async ({ actorUserId, params }) =>
                    success(await queues.retryFailed({ ...params, actorUserId })),
                { params: queueParamsSchema }
            )
            .post(
                "/:queue/pause",
                async ({ actorUserId, params }) =>
                    success(await queues.pause({ ...params, actorUserId })),
                { params: queueParamsSchema }
            )
            .post(
                "/:queue/resume",
                async ({ actorUserId, params }) =>
                    success(await queues.resume({ ...params, actorUserId })),
                { params: queueParamsSchema }
            )
            .post(
                "/:queue/clean",
                async ({ actorUserId, params, body }) =>
                    success(await queues.clean({ ...body, queue: params.queue, actorUserId })),
                { params: queueParamsSchema, body: cleanJobsSchema }
            )
    );
}
