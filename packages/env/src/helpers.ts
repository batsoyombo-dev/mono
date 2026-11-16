import { z } from "zod";

/** Empty strings in .env mean "not configured", so optional integrations can be left blank. */
export const optional = <T extends z.ZodType>(schema: T) =>
    z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

/** A comma-separated list; entries are trimmed, blanks dropped, each checked against `item`. */
export const commaSeparated = <T extends z.ZodType<unknown, string>>(item: T) =>
    z
        .string()
        .transform((value) =>
            value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
        )
        .pipe(z.array(item));

export const port = z.coerce.number().int().min(1).max(65535);
