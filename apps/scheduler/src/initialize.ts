import { healthCheck } from "./jobs";

export const jobs = [
    {
        name: "health-check",
        cronExpression: "5 * * * *",
        task: healthCheck,
    },
];
