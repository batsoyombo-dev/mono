import { boundaries } from "@mono/eslint-config/boundaries";
import { nodeConfig } from "@mono/eslint-config/node";

/** @type {import("eslint").Linter.Config[]} */
export default [...nodeConfig, ...boundaries("mq-worker")];
