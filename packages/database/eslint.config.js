import { boundaries } from "@mono/eslint-config/boundaries";
import { nodeConfig } from "@mono/eslint-config/node";

// prisma.config.ts may read process.env: see ENV_READERS in @mono/eslint-config/boundaries.
/** @type {import("eslint").Linter.Config[]} */
export default [...nodeConfig, ...boundaries("database")];
