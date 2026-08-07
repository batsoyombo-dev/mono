import { describe, expect, test } from "bun:test";

import { Scheduler } from "../src/Scheduler";

describe("Scheduler", () => {
    test("updates persistent enabled state", () => {
        const scheduler = new Scheduler();
        const jobId = scheduler.addJob({
            name: "disabled-job",
            cronExpression: "* * * * *",
            task: () => undefined,
            options: { enabled: false },
        });

        scheduler.toggleJob(jobId, true);

        expect(scheduler.getJob(jobId)?.enabled).toBe(true);
    });

    test("records a timed-out execution only once", async () => {
        const scheduler = new Scheduler();
        const jobId = scheduler.addJob({
            name: "slow-job",
            cronExpression: "* * * * *",
            task: () => new Promise((resolve) => setTimeout(resolve, 30)),
            options: { timeout: 5 },
        });

        await expect(scheduler.runJob(jobId)).rejects.toThrow("Job execution timed out");
        await new Promise((resolve) => setTimeout(resolve, 40));

        expect(scheduler.getStats()).toMatchObject({ completedJobs: 0, failedJobs: 1 });
        expect(scheduler.getHistory(jobId)).toHaveLength(1);
        expect(scheduler.getHistory(jobId)[0]?.success).toBe(false);
    });
});
