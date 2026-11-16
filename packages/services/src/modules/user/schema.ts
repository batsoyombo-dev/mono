import { z } from "zod";

export const updateProfileSchema = z
    .object({
        name: z.string().trim().min(1).max(120).optional(),
        image: z.url().max(2048).nullable().optional(),
    })
    .refine((input) => Object.values(input).some((value) => value !== undefined), {
        message: "At least one profile field is required",
    });
