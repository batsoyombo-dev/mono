import { z } from "zod";

export const paginationSchema = z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
});

export const filterOperatorSchema = z.enum([
    "equals",
    "startsWith",
    "endsWith",
    "contains",
    "in",
    "gte",
    "lte",
    "gt",
    "lt",
    "not",
    "notIn",
    "blank",
    "notBlank",
    "between",
]);

export const filterTypeSchema = z.enum(["number", "text", "date", "boolean"]);

const filterValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.date(),
    z.array(z.string()),
    z.array(z.number()),
    z.array(z.boolean()),
    z.array(z.date()),
]);

export const singleFilterSchema = z.object({
    id: z.string().trim().min(1),
    operator: filterOperatorSchema,
    value: filterValueSchema,
    type: filterTypeSchema,
});

export const filterSchema = z.array(singleFilterSchema);

export const singleSortSchema = z.object({
    id: z.string(),
    desc: z.boolean(),
});

export const sortSchema = z.array(singleSortSchema);
export const globalFilterSchema = z.string().nullable();

export const listSchema = z.object({
    pagination: paginationSchema.optional(),
    filters: filterSchema.optional(),
    globalFilter: globalFilterSchema.optional(),
    sorts: sortSchema.optional(),
});
