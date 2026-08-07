/* eslint-disable @typescript-eslint/no-explicit-any */
export interface JobContext {
    readonly jobId: string;
    readonly jobName: string;
    readonly executionId: string;
    readonly attempt: number;
    readonly metadata: Record<string, unknown>;
    readonly abortSignal: AbortSignal;
}

export type JobTask = (context: JobContext) => Promise<unknown> | unknown;

export interface JobOptions {
    readonly id?: string;
    readonly enabled?: boolean;
    readonly timezone?: string;
    readonly retries?: number;
    readonly timeout?: number;
    readonly runOnInit?: boolean;
    readonly maxInstances?: number;
    readonly metadata?: Record<string, unknown>;
}

export interface JobConfig {
    readonly name: string;
    readonly cronExpression: string;
    readonly task: JobTask;
    readonly options?: JobOptions;
}

export interface Job {
    readonly id: string;
    readonly name: string;
    readonly cronExpression: string;
    readonly task: JobTask;
    enabled: boolean;
    readonly timezone: string;
    readonly retries: number;
    readonly timeout: number;
    readonly runOnInit: boolean;
    readonly maxInstances: number;
    readonly metadata: Record<string, unknown>;
    readonly createdAt: Date;
    lastRun: Date | null;
    nextRun: Date | null;
    runCount: number;
    failCount: number;
    cronTask: any; // node-cron task type
}

export interface JobExecution {
    readonly id: string;
    readonly jobId: string;
    readonly startTime: number;
    readonly manual: boolean;
    timeout: ReturnType<typeof setTimeout> | null;
    abortController: AbortController;
    completed: boolean;
}

export interface JobHistoryEntry {
    readonly jobId: string;
    readonly jobName: string;
    readonly executionId: string;
    readonly startTime: number;
    readonly endTime: number;
    readonly duration: number;
    readonly success: boolean;
    readonly error: string | null;
    readonly result: unknown;
    readonly manual: boolean;
}

export interface SchedulerStats {
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
}

export interface SchedulerOptions {
    readonly maxHistorySize?: number;
    readonly timezone?: string;
    readonly logLevel?: string;
    readonly logFile?: string;
}

export interface JobInfo extends Job {
    readonly isRunning: boolean;
    readonly runningInstances: number;
}
