import type { PaginationRequest, SortRequest } from "@mono/utils";
import { parsePagination } from "@mono/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Sort = {
    id: string;
    desc: boolean;
};

export type Filter = {
    id: string;
    value: string | number | Date | string[] | number[] | Date[];
    type: "number" | "text" | "date";
    operator:
        | "equals"
        | "startsWith"
        | "endsWith"
        | "contains"
        | "in"
        | "gte"
        | "lte"
        | "gt"
        | "lt"
        | "not"
        | "notIn"
        | "blank"
        | "notBlank"
        | "between";
};

export type Filters = Filter[];

export const parseValue = (
    operator: Filter["operator"],
    type: Filter["type"],
    value?: Filter["value"]
) => {
    switch (type) {
        case "text":
            return {
                ...(operator === "equals" ? { equals: `${value}`, mode: "insensitive" } : {}),
                ...(operator === "contains" ? { contains: `${value}`, mode: "insensitive" } : {}),
                ...(operator === "startsWith"
                    ? { startsWith: `${value}`, mode: "insensitive" }
                    : {}),
                ...(operator === "endsWith" ? { endsWith: `${value}`, mode: "insensitive" } : {}),
                ...(operator === "blank" ? { equals: "" } : {}),
                ...(operator === "notBlank" ? { not: { equals: "" } } : {}),
            };
        case "number":
            return {
                ...(operator === "equals" ? { equals: Number(value) } : {}),
                ...(operator === "gt" ? { gt: Number(value) } : {}),
                ...(operator === "lt" ? { lt: Number(value) } : {}),
                ...(operator === "not" ? { not: Number(value) } : {}),
                ...(operator === "lte" ? { lte: Number(value) } : {}),
                ...(operator === "gte" ? { gte: Number(value) } : {}),
            };
        case "date":
            return {
                ...(operator === "equals" ? { equals: new Date(value as string) } : {}),
                ...(operator === "gt" ? { gt: new Date(value as string) } : {}),
                ...(operator === "lt" ? { lt: new Date(value as string) } : {}),
                ...(operator === "not" ? { not: new Date(value as string) } : {}),
                ...(operator === "lte" ? { lte: new Date(value as string) } : {}),
                ...(operator === "gte" ? { gte: new Date(value as string) } : {}),
            };
        default:
            return undefined;
    }
};

const parseArrayValue = (
    operator: Filter["operator"],
    type: Filter["type"],
    value: Filter["value"]
) => {
    if (!Array.isArray(value)) return;

    const firstValue = value.at(0);
    const secondValue = value.at(1);

    if (firstValue === undefined && secondValue === undefined) return undefined;

    switch (type) {
        case "text":
            return {
                in: [...(firstValue ? [firstValue] : []), ...(secondValue ? [secondValue] : [])],
            };
        case "number":
            return {
                gte: firstValue && firstValue !== "" ? Number(firstValue) : undefined,
                lt: secondValue && secondValue !== "" ? Number(secondValue) : undefined,
            };
        case "date":
            return {
                gte: firstValue ? new Date(firstValue) : undefined,
                lte: secondValue ? new Date(secondValue) : undefined,
            };
        default:
            return undefined;
    }
};

function setNestedValue(obj: Record<string, any>, keys: string[], value: any) {
    const [firstKey, ...restKeys] = keys;

    if (!firstKey || keys.some((key) => ["__proto__", "constructor", "prototype"].includes(key))) {
        return;
    }

    if (!restKeys.length) {
        obj[firstKey] = value;
        return;
    }

    if (
        !Object.hasOwn(obj, firstKey) ||
        typeof obj[firstKey] !== "object" ||
        obj[firstKey] === null ||
        Array.isArray(obj[firstKey])
    ) {
        obj[firstKey] = {};
    }

    setNestedValue(obj[firstKey], restKeys, value);
}

export const parseFilters = (filters: Filters) => {
    const where: Record<string, any> = {};

    filters.forEach(({ id, value, operator, type }) => {
        if (!id || value === undefined || value === null) return;

        const keys = id.split(".");

        let parsed;

        if (Array.isArray(value)) {
            parsed = parseArrayValue(operator, type, value);
        } else {
            parsed = parseValue(operator, type, value);
        }

        if (!parsed) return;

        setNestedValue(where, keys, parsed);
    });

    return where;
};

export const parseSorts = (sorts?: Sort[]) => {
    if (!sorts) return [];

    return sorts.map(({ id, desc }) => ({
        [id]: desc ? "desc" : "asc",
    })) satisfies SortRequest;
};

export const parseListRouteInput = (
    pagination?: Pick<PaginationRequest, "page" | "pageSize">,
    filters?: Filters,
    globalFilter?: string | null,
    sorts?: Sort[]
) => {
    return {
        filters: parseFilters(filters ?? []),
        globalFilter,
        pagination: parsePagination(pagination ? pagination : { page: 1, pageSize: 20 }),
        sorts: parseSorts(sorts ?? []),
    };
};
