import { EventEmitter } from "eventemitter3";
import cron from "node-cron";

import { Logger, logger } from "@mono/logger";

import { generateUuid } from "@mono/utils";
import type {
    Job,
    JobConfig,
    JobExecution,
    JobHistoryEntry,
    JobInfo,
    SchedulerOptions,
    SchedulerStats,
} from "./types";

export class Scheduler extends EventEmitter {
    readonly #jobs = new Map<string, Job>();
    readonly #runningJobs = new Map<string, JobExecution[]>();
    readonly #jobHistory: JobHistoryEntry[] = [];
    readonly #maxHistorySize: number;
    readonly #timezone: string;
    readonly #logger: Logger;
    #isRunning = false;
    #stats: SchedulerStats = {
        totalJobs: 0,
        activeJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
    };

    constructor(options: SchedulerOptions = {}) {
        super();

        this.#maxHistorySize = options.maxHistorySize ?? 1000;
        this.#timezone = options.timezone ?? "UTC";

        // Setup logger
        this.#logger = logger;
    }

    /**
     * Add a new cron job
     */
    addJob(jobConfig: JobConfig): string {
        const { name, cronExpression, task, options = {} } = jobConfig;

        // Validate cron expression
        if (!cron.validate(cronExpression)) {
            throw new Error(`Invalid cron expression: ${cronExpression}`);
        }

        const jobId = options.id ?? generateUuid();

        const job: Job = {
            id: jobId,
            name,
            cronExpression,
            task,
            enabled: options.enabled ?? true,
            timezone: options.timezone ?? this.#timezone,
            retries: options.retries ?? 0,
            timeout: options.timeout ?? 30_000,
            runOnInit: options.runOnInit ?? false,
            maxInstances: options.maxInstances ?? 1,
            metadata: options.metadata ?? {},
            createdAt: new Date(),
            lastRun: null,
            nextRun: null,
            runCount: 0,
            failCount: 0,
            cronTask: null,
        };

        // Create cron task
        job.cronTask = cron.schedule(
            cronExpression,
            async () => {
                await this.#executeJob(job);
            },
            {
                timezone: job.timezone,
            }
        );

        this.#jobs.set(jobId, job);
        this.#updateStats();

        this.#logger.info(`Job added: ${name} (${cronExpression})`, { jobId, name });
        this.emit("jobAdded", job);

        // Run immediately if requested
        if (job.runOnInit && this.#isRunning) {
            setImmediate(() => this.#executeJob(job));
        }

        return jobId;
    }

    /**
     * Remove a job
     */
    removeJob(jobId: string): void {
        const job = this.#jobs.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        // Stop the cron task
        if (job.cronTask) {
            job.cronTask.stop();
            job.cronTask.destroy();
        }

        // Cancel running instances
        const runningInstances = this.#runningJobs.get(jobId);
        if (runningInstances) {
            for (const instance of runningInstances) {
                if (instance.timeout) {
                    clearTimeout(instance.timeout);
                }
            }
            this.#runningJobs.delete(jobId);
        }

        this.#jobs.delete(jobId);
        this.#updateStats();

        this.#logger.info(`Job removed: ${job.name}`, { jobId });
        this.emit("jobRemoved", job);
    }

    /**
     * Enable/disable a job
     */
    toggleJob(jobId: string, enabled: boolean): void {
        const job = this.#jobs.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        if (enabled && this.#isRunning) {
            job.cronTask.start();
        } else {
            job.cronTask.stop();
        }

        this.#logger.info(`Job ${enabled ? "enabled" : "disabled"}: ${job.name}`, {
            jobId,
        });
        this.emit(
            "jobToggled",
            {
                ...job,
                enabled,
            },
            enabled
        );
    }

    /**
     * Execute a job manually
     */
    async runJob(jobId: string): Promise<unknown> {
        const job = this.#jobs.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        return await this.#executeJob(job, true);
    }

    /**
     * Start the scheduler
     */
    start(): void {
        if (this.#isRunning) {
            this.#logger.warn("Scheduler is already running");
            return;
        }

        this.#isRunning = true;

        // Start all enabled jobs
        for (const job of this.#jobs.values()) {
            if (job.enabled) {
                job.cronTask.start();
            }
        }

        this.#logger.info("Scheduler started", { totalJobs: this.#jobs.size });
        this.emit("schedulerStarted");
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (!this.#isRunning) {
            this.#logger.warn("Scheduler is not running");
            return;
        }

        this.#isRunning = false;

        // Stop all jobs
        for (const job of this.#jobs.values()) {
            job.cronTask.stop();
        }

        // Cancel running jobs
        for (const [_jobId, instances] of this.#runningJobs.entries()) {
            for (const instance of instances) {
                if (instance.timeout) {
                    clearTimeout(instance.timeout);
                }
            }
        }
        this.#runningJobs.clear();

        this.#updateStats();
        this.#logger.info("Scheduler stopped");
        this.emit("schedulerStopped");
    }

    /**
     * Get job information
     */
    getJob(jobId: string): JobInfo | null {
        const job = this.#jobs.get(jobId);
        if (!job) {
            return null;
        }

        const runningInstances = this.#runningJobs.get(jobId);
        return {
            ...job,
            isRunning: Boolean(runningInstances?.length),
            runningInstances: runningInstances?.length ?? 0,
        };
    }

    /**
     * Get all jobs
     */
    getAllJobs(): JobInfo[] {
        return Array.from(this.#jobs.values()).map((job) => {
            const runningInstances = this.#runningJobs.get(job.id);
            return {
                ...job,
                isRunning: Boolean(runningInstances?.length),
                runningInstances: runningInstances?.length ?? 0,
            };
        });
    }

    /**
     * Get job execution history
     */
    getHistory(jobId?: string, limit = 100): JobHistoryEntry[] {
        let history = this.#jobHistory;

        if (jobId) {
            history = history.filter((entry) => entry.jobId === jobId);
        }

        return history.slice(0, limit);
    }

    /**
     * Get scheduler statistics
     */
    getStats(): SchedulerStats {
        return { ...this.#stats };
    }

    /**
     * Bulk add jobs from configuration
     */
    addJobs(jobConfigs: JobConfig[]): string[] {
        const addedJobs: string[] = [];

        for (const config of jobConfigs) {
            try {
                const jobId = this.addJob(config);
                addedJobs.push(jobId);
            } catch (error) {
                this.#logger.error(`Failed to add job ${config.name}`, {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return addedJobs;
    }

    /**
     * Export job configurations
     */
    exportJobs(): Array<Omit<JobConfig, "task"> & { task: string }> {
        return Array.from(this.#jobs.values()).map((job) => ({
            name: job.name,
            cronExpression: job.cronExpression,
            task: job.task.toString(), // Serialize function as string
            options: {
                enabled: job.enabled,
                timezone: job.timezone,
                retries: job.retries,
                timeout: job.timeout,
                maxInstances: job.maxInstances,
                metadata: job.metadata,
            },
        }));
    }

    /**
     * Check if scheduler is running
     */
    get isRunning(): boolean {
        return this.#isRunning;
    }

    /**
     * Get total number of jobs
     */
    get jobCount(): number {
        return this.#jobs.size;
    }

    /**
     * Internal method to execute a job
     */
    async #executeJob(job: Job, manual = false): Promise<unknown> {
        if (!job.enabled && !manual) {
            return;
        }

        // Check max instances
        const runningInstances = this.#runningJobs.get(job.id) ?? [];
        if (runningInstances.length >= job.maxInstances) {
            this.#logger.warn(`Job ${job.name} skipped - max instances reached`, {
                jobId: job.id,
                running: runningInstances.length,
            });
            return;
        }

        const executionId = generateUuid();
        const startTime = Date.now();

        const execution: JobExecution = {
            id: executionId,
            jobId: job.id,
            startTime,
            manual,
            timeout: null,
        };

        // Add to running jobs
        if (!this.#runningJobs.has(job.id)) {
            this.#runningJobs.set(job.id, []);
        }
        this.#runningJobs.get(job.id)!.push(execution);

        // Set timeout
        execution.timeout = setTimeout(() => {
            this.#logger.error(`Job ${job.name} timed out`, { jobId: job.id, executionId });
            this.#handleJobCompletion(job, execution, new Error("Job execution timed out"));
        }, job.timeout);

        job.lastRun = new Date();
        job.runCount++;
        this.#updateStats();

        this.#logger.info(`Executing job: ${job.name}`, {
            jobId: job.id,
            executionId,
            manual,
        });

        this.emit("jobStarted", job, execution);

        let attempt = 0;
        let lastError: Error | null = null;

        while (attempt <= job.retries) {
            try {
                const result = await job.task({
                    jobId: job.id,
                    jobName: job.name,
                    executionId,
                    attempt,
                    metadata: job.metadata,
                });

                if (execution.timeout) {
                    clearTimeout(execution.timeout);
                }
                this.#handleJobCompletion(job, execution, null, result);
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                attempt++;

                if (attempt <= job.retries) {
                    this.#logger.warn(
                        `Job ${job.name} failed, retrying (${attempt}/${job.retries})`,
                        {
                            jobId: job.id,
                            executionId,
                            error: lastError.message,
                        }
                    );

                    // Wait before retry (exponential backoff)
                    await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
                }
            }
        }

        // All retries failed
        if (execution.timeout) {
            clearTimeout(execution.timeout);
        }
        this.#handleJobCompletion(job, execution, lastError);
        throw lastError;
    }

    /**
     * Handle job completion
     */
    #handleJobCompletion(
        job: Job,
        execution: JobExecution,
        error: Error | null,
        result: unknown = null
    ): void {
        const endTime = Date.now();
        const duration = endTime - execution.startTime;

        // Remove from running jobs
        const runningInstances = this.#runningJobs.get(job.id);
        if (runningInstances) {
            const index = runningInstances.findIndex((inst) => inst.id === execution.id);
            if (index > -1) {
                runningInstances.splice(index, 1);
            }
        }

        // Update job stats
        if (error) {
            job.failCount++;
            this.#stats.failedJobs++;
        } else {
            this.#stats.completedJobs++;
        }

        // Add to history
        const historyEntry: JobHistoryEntry = {
            jobId: job.id,
            jobName: job.name,
            executionId: execution.id,
            startTime: execution.startTime,
            endTime,
            duration,
            success: !error,
            error: error?.message ?? null,
            result,
            manual: execution.manual,
        };

        this.#jobHistory.unshift(historyEntry);
        if (this.#jobHistory.length > this.#maxHistorySize) {
            this.#jobHistory.splice(this.#maxHistorySize);
        }

        this.#updateStats();

        if (error) {
            this.#logger.error(`Job ${job.name} failed`, {
                jobId: job.id,
                executionId: execution.id,
                duration,
                error: error.message,
            });
            this.emit("jobFailed", job, execution, error);
        } else {
            this.#logger.info(`Job ${job.name} completed`, {
                jobId: job.id,
                executionId: execution.id,
                duration,
            });
            this.emit("jobCompleted", job, execution, result);
        }
    }

    /**
     * Update internal statistics
     */
    #updateStats(): void {
        this.#stats.totalJobs = this.#jobs.size;
        this.#stats.activeJobs = Array.from(this.#runningJobs.values()).reduce(
            (sum, instances) => sum + instances.length,
            0
        );
    }
}
