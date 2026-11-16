import { Elysia } from "elysia";

import { success } from "../utils/response";

export const health = new Elysia({
    prefix: "/health",
    name: "Health",
    detail: { tags: ["health"] },
}).get("/", () => success({ status: "ok" }));
