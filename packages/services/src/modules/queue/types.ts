import type { z } from "zod";

import type { Queues } from "../../queues/names";
import type {
    cleanJobsSchema,
    enqueueJobSchema,
    jobStatusSchema,
    listJobsQuerySchema,
} from "./schema";

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type ListJobsPayload = z.infer<typeof listJobsQuerySchema>;
export type EnqueueJobPayload = z.input<typeof enqueueJobSchema>;
export type CleanJobsPayload = z.input<typeof cleanJobsSchema>;

/** `actorUserId` is null when the CLI performs the action. */
type Actor = { actorUserId: number | null };
type QueueTarget = Actor & { queue: Queues };
type JobTarget = QueueTarget & { jobId: string };

export type OverviewInput = Actor;
export type ListJobsInput = QueueTarget & Partial<ListJobsPayload>;
export type JobInput = JobTarget;
export type EnqueueJobInput = QueueTarget & EnqueueJobPayload;
export type TriggerScheduleInput = QueueTarget & { scheduleId: string };
export type QueueInput = QueueTarget;
export type CleanJobsInput = QueueTarget & CleanJobsPayload;

export type ScheduleSummary = {
    id: string;
    pattern: string;
    timezone: string;
    jobName: string;
    /** Whether a worker has registered this schedule in Redis yet. */
    registered: boolean;
    nextRunAt: string | null;
};

export type QueueOverview = {
    name: Queues;
    paused: boolean;
    counts: Record<JobStatus, number>;
    jobNames: string[];
    schedules: ScheduleSummary[];
};

export type JobSummary = {
    id: string;
    name: string;
    attemptsMade: number;
    maxAttempts: number;
    progress: unknown;
    failedReason: string | null;
    createdAt: string | null;
    processedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
};

export type JobDetail = JobSummary & {
    queue: Queues;
    status: string;
    data: unknown;
    options: Record<string, unknown>;
    returnValue: unknown;
    stacktrace: string[];
    logs: string[];
};

export type JobListResponse = {
    collection: JobSummary[];
    meta: { total: number; totalPages: number; page: number; pageSize: number };
};

export type EnqueuedJob = { queue: Queues; id: string; name: string };

export type QueueOperations = {
    overview(input: OverviewInput): Promise<QueueOverview[]>;
    listJobs(input: ListJobsInput): Promise<JobListResponse>;
    getJob(input: JobInput): Promise<JobDetail>;
    enqueueJob(input: EnqueueJobInput): Promise<EnqueuedJob>;
    triggerSchedule(input: TriggerScheduleInput): Promise<EnqueuedJob>;
    retryJob(input: JobInput): Promise<{ id: string }>;
    promoteJob(input: JobInput): Promise<{ id: string }>;
    removeJob(input: JobInput): Promise<{ id: string }>;
    retryFailed(input: QueueInput): Promise<{ retried: number }>;
    pause(input: QueueInput): Promise<{ paused: true }>;
    resume(input: QueueInput): Promise<{ paused: false }>;
    clean(input: CleanJobsInput): Promise<{ removed: number }>;
};
