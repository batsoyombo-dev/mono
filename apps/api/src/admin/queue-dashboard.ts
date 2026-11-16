import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ElysiaAdapter } from "@bull-board/elysia";
import { Elysia } from "elysia";

import { queues } from "@mono/services/queues";

import type { AdminAccess } from "../controllers";
import { getAuthorizedAdminUserId } from "../controllers";

export const QUEUE_DASHBOARD_PATH = "/admin/queues";

/**
 * Bull Board web UI for every queue: recent jobs by status, payloads, logs, errors, retry,
 * promote, clean, pause. Same Better Auth session cookie and admin rule as /api/v1/admin.
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

    const board = await serverAdapter.registerPlugin();

    return new Elysia({ name: "QueueDashboard" })
        .onRequest(async ({ request }) => {
            const { pathname } = new URL(request.url);
            if (
                pathname === QUEUE_DASHBOARD_PATH ||
                pathname.startsWith(`${QUEUE_DASHBOARD_PATH}/`)
            ) {
                await getAuthorizedAdminUserId(access, request);
            }
        })
        .use(board);
}
