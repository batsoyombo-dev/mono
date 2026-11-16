import { mailClient } from "@mono/services";

import { createJobMap } from "./job-map";

/** The worker's job handlers, wired to the app's real clients. */
export const jobMap = createJobMap({ mail: mailClient });
