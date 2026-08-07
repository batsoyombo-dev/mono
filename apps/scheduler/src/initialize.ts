import { healthCheck } from "./jobs";
import { eventNotificationClient } from "@mono/services";

export const jobs = [
    {
        name: "health-check",
        cronExpression: "5 * * * *",
        task: healthCheck,
    },
    {
        name: "process-scheduled-notifications",
        cronExpression: "* * * * *",
        task: () => eventNotificationClient.processScheduledNotifications(),
    },
];
