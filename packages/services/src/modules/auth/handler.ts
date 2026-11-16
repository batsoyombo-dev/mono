import { env } from "@mono/env";

import { defaultQueue } from "../../queues/registry";
import { createAuthEmails } from "./service";
import type { AuthEmails } from "./types";

export const authEmails: AuthEmails = createAuthEmails({
    queue: defaultQueue,
    appName: env.app.APP_NAME,
});
