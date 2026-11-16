import type { z } from "zod";
import type { healthSchema, mailSchema } from "./schemas";

/** Parsed payloads, as handlers receive them. */
export type HealthSchemaType = z.output<typeof healthSchema>;
export type MailSchemaType = z.output<typeof mailSchema>;

/** Raw payloads, as callers enqueue them. */
export type HealthJobInput = z.input<typeof healthSchema>;
export type MailJobInput = z.input<typeof mailSchema>;
