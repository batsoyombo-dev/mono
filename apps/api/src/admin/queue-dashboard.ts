import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ElysiaAdapter } from "@bull-board/elysia";

import { queues } from "@mono/services/queues";

import type { AdminAccess } from "../controllers";
import { adminOnly } from "../plugins/admin-only.plugin";

export const QUEUE_DASHBOARD_PATH = "/admin/queues";

/**
 * Bull Board web UI for every queue: recent jobs by status, payloads, logs, errors, retry,
 * promote, clean, pause. Same Better Auth session cookie and admin rule as /api/v1/admin;
 * `adminOnly` guards every route the board registers (page, static assets and its JSON API).
 * Lives outside the request layer because it needs the real BullMQ queues.
 */
export async function createQueueDashboard(access: AdminAccess) {
    const serverAdapter = new ElysiaAdapter({
        prefix: QUEUE_DASHBOARD_PATH,
        basePath: QUEUE_DASHBOARD_PATH,
    });

    createBullBoard({
        queues: Object.values(queues).map(({ queue }) => new BullMQAdapter(queue)),
        serverAdapter,
        options: {
            // Bun cannot use Bull Board's default asset lookup; point it at the installed UI.
            uiBasePath: dirname(fileURLToPath(import.meta.resolve("@bull-board/ui/package.json"))),
            uiConfig: { boardTitle: "Queues" },
        },
    });

    return adminOnly(access, await serverAdapter.registerPlugin());
}
