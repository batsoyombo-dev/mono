import { randomUUID } from "node:crypto";

import { Elysia } from "elysia";

import { logger } from "@mono/logger";

export const REQUEST_ID_HEADER = "x-request-id";

type RequestContext = { id: string; startedAt: number };

const contexts = new WeakMap<Request, RequestContext>();
// Accept a caller's id (load balancer, gateway, another service) only when it looks like one.
const validRequestId = /^[\w.:-]{1,128}$/;
const quietPaths = ["/health"];

/** The id of the request, also sent back as the `x-request-id` header. Use it in logs. */
export function getRequestId(request: Request): string | undefined {
    return contexts.get(request)?.id;
}

function statusOf(response: unknown, status: unknown): number {
    if (response instanceof Response) return response.status;
    return typeof status === "number" ? status : 200;
}

/**
 * Gives every request an id (`x-request-id`, reused when the caller sends a valid one) and logs
 * one line per request with method, routed path, status and duration. Health checks are not
 * logged.
 */
export const requestContextPlugin = new Elysia({ name: "RequestContext" })
    .onRequest(({ request, set }) => {
        const incoming = request.headers.get(REQUEST_ID_HEADER);
        const id = incoming && validRequestId.test(incoming) ? incoming : randomUUID();
        contexts.set(request, { id, startedAt: performance.now() });
        set.headers[REQUEST_ID_HEADER] = id;
    })
    // `path` is the path Elysia routed, which can differ from the URL's parsed pathname for
    // unusual URLs; both are logged when they differ.
    .onAfterResponse(({ request, path, set, responseValue }) => {
        const context = contexts.get(request);
        if (
            !context ||
            quietPaths.some((quiet) => path === quiet || path.startsWith(`${quiet}/`))
        ) {
            return;
        }

        const urlPath = new URL(request.url).pathname;
        logger.info("HTTP request", {
            requestId: context.id,
            method: request.method,
            path,
            ...(urlPath === path ? {} : { urlPath }),
            status: statusOf(responseValue, set.status),
            durationMs: Math.round(performance.now() - context.startedAt),
        });
    })
    .as("global");
