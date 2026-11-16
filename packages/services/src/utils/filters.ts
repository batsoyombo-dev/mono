/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestError } from "@mono/error-handling";
import type { Filter, Filters, PaginationRequest, SortRequest } from "@mono/utils";
import { parsePagination } from "@mono/utils";

export type { Filter, Filters } from "@mono/utils";

/**
 * Which fields a list endpoint lets callers filter and sort by. Both lists are required: filter
 * ids are Prisma paths, so an open list would let callers query any column or relation (for
 * example `accounts.some.password`). List only fields that are safe to expose.
 */
export type ListFieldOptions = {
    filterFields: readonly string[];
    sortFields: readonly string[];
    caseSensitiveFields?: readonly string[];
};

const isBlankOperator = (operator: Filter["operator"]) =>
    operator === "blank" || operator === "notBlank";

function assertFiniteNumber(value: Filter["value"]): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) throw new BadRequestError("Number filter values must be finite");
    return parsed;
}

function assertDate(value: Filter["value"]): Date {
    const parsed =
        value instanceof Date
            ? value
            : typeof value === "number"
              ? new Date(value)
              : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestError("Date filter values must be valid");
    }
    return parsed;
}

function assertText(value: Filter["value"]): string {
    if (typeof value !== "string" && typeof value !== "number") {
        throw new BadRequestError("Text filter values must be strings");
    }
    return String(value);
}

function assertBoolean(value: Filter["value"]): boolean {
    if (typeof value !== "boolean") {
        throw new BadRequestError("Boolean filter values must be booleans");
    }
    return value;
}

function parseScalarValue(type: Filter["type"], value: Filter["value"]) {
    switch (type) {
        case "text":
            return assertText(value);
        case "number":
            return assertFiniteNumber(value);
        case "date":
            return assertDate(value);
        case "boolean":
            return assertBoolean(value);
    }
}

const scalarOperators: Record<Filter["type"], ReadonlySet<Filter["operator"]>> = {
    text: new Set(["equals", "startsWith", "endsWith", "contains", "not"]),
    number: new Set(["equals", "gt", "lt", "not", "lte", "gte"]),
    date: new Set(["equals", "gt", "lt", "not", "lte", "gte"]),
    boolean: new Set(["equals", "not"]),
};

export function parseValue(
    operator: Filter["operator"],
    type: Filter["type"],
    value?: Filter["value"],
    options: { caseInsensitive?: boolean } = {}
) {
    if (isBlankOperator(operator)) {
        if (type === "text") return operator === "blank" ? { equals: "" } : { not: { equals: "" } };
        if (type === "date") return operator === "blank" ? { equals: null } : { not: null };
        throw new BadRequestError("Blank filters only support text or date fields");
    }
    if (!scalarOperators[type].has(operator)) {
        throw new BadRequestError(`The ${operator} operator requires an array value`);
    }
    if (value === undefined || value === null) {
        throw new BadRequestError(`A value is required for the ${operator} operator`);
    }

    const scalar = parseScalarValue(type, value);
    const caseInsensitive = options.caseInsensitive ?? true;

    switch (type) {
        case "text":
            return {
                ...(operator === "equals"
                    ? { equals: scalar, ...(caseInsensitive ? { mode: "insensitive" } : {}) }
                    : {}),
                ...(operator === "contains"
                    ? { contains: scalar, ...(caseInsensitive ? { mode: "insensitive" } : {}) }
                    : {}),
                ...(operator === "startsWith"
                    ? { startsWith: scalar, ...(caseInsensitive ? { mode: "insensitive" } : {}) }
                    : {}),
                ...(operator === "endsWith"
                    ? { endsWith: scalar, ...(caseInsensitive ? { mode: "insensitive" } : {}) }
                    : {}),
                // Prisma's nested `not` filter has no `mode`; it must sit beside `not`.
                ...(operator === "not"
                    ? { not: scalar, ...(caseInsensitive ? { mode: "insensitive" } : {}) }
                    : {}),
            };
        case "number":
            return {
                ...(operator === "equals" ? { equals: scalar } : {}),
                ...(operator === "gt" ? { gt: scalar } : {}),
                ...(operator === "lt" ? { lt: scalar } : {}),
                ...(operator === "not" ? { not: scalar } : {}),
                ...(operator === "lte" ? { lte: scalar } : {}),
                ...(operator === "gte" ? { gte: scalar } : {}),
            };
        case "date":
            return {
                ...(operator === "equals" ? { equals: scalar } : {}),
                ...(operator === "gt" ? { gt: scalar } : {}),
                ...(operator === "lt" ? { lt: scalar } : {}),
                ...(operator === "not" ? { not: scalar } : {}),
                ...(operator === "lte" ? { lte: scalar } : {}),
                ...(operator === "gte" ? { gte: scalar } : {}),
            };
        case "boolean":
            return {
                ...(operator === "equals" ? { equals: scalar } : {}),
                ...(operator === "not" ? { not: scalar } : {}),
            };
    }
}

function parseArrayValue(
    operator: Filter["operator"],
    type: Filter["type"],
    value: Filter["value"]
) {
    if (!Array.isArray(value) || value.length === 0) return undefined;

    if (operator === "in" || operator === "notIn") {
        const values = value.map((entry) => parseScalarValue(type, entry));
        return operator === "in" ? { in: values } : { notIn: values };
    }

    if (operator === "between") {
        if (type === "text" || type === "boolean") {
            throw new BadRequestError("Only number and date filters support ranges");
        }
        if (value.length !== 2 || value[0] === undefined || value[1] === undefined) {
            throw new BadRequestError("The between operator requires exactly two values");
        }
        return {
            gte: parseScalarValue(type, value[0]),
            lte: parseScalarValue(type, value[1]),
        };
    }

    throw new BadRequestError(`The ${operator} operator requires a scalar value`);
}

function setNestedValue(object: Record<string, any>, keys: string[], value: any) {
    const [firstKey, ...restKeys] = keys;
    if (!firstKey) return;
    if (["__proto__", "constructor", "prototype"].includes(firstKey)) {
        throw new BadRequestError("Invalid filter field");
    }
    if (!restKeys.length) {
        object[firstKey] = value;
        return;
    }
    if (!object[firstKey]) object[firstKey] = {};
    setNestedValue(object[firstKey], restKeys, value);
}

/** Builds a Prisma `where` from filters. Throws `BadRequestError` for a field not in `filterFields`. */
export function parseFilters(
    filters: Filters,
    options: Pick<ListFieldOptions, "filterFields" | "caseSensitiveFields">
): Record<string, any> {
    const clauses: Record<string, any>[] = [];
    const allowed = new Set(options.filterFields);
    const caseSensitiveFields = new Set(options.caseSensitiveFields ?? []);

    filters.forEach(({ id, value, operator, type }) => {
        if (!id || (!isBlankOperator(operator) && (value === undefined || value === null))) return;
        if (!allowed.has(id)) throw new BadRequestError(`Filtering by ${id} is not allowed`);
        const parsed = Array.isArray(value)
            ? parseArrayValue(operator, type, value)
            : parseValue(operator, type, value, {
                  caseInsensitive: !caseSensitiveFields.has(id),
              });
        if (!parsed) return;

        const clause: Record<string, any> = {};
        setNestedValue(clause, id.split("."), parsed);
        clauses.push(clause);
    });

    const [only] = clauses;
    if (clauses.length === 1 && only) return only;
    return clauses.length === 0 ? {} : { AND: clauses };
}

/** Builds a Prisma `orderBy`. Throws `BadRequestError` for a field not in `allowedFields`. */
export function parseSorts(sorts: SortRequest | undefined, allowedFields: readonly string[]) {
    if (!sorts) return [];
    const allowed = new Set(allowedFields);
    const seen = new Set<string>();

    return sorts.flatMap(({ id, desc }) => {
        if (!id || seen.has(id)) return [];
        if (!allowed.has(id)) {
            throw new BadRequestError(`Sorting by ${id} is not allowed`);
        }
        seen.add(id);
        return [{ [id]: desc ? "desc" : "asc" }];
    });
}

export type ListRouteInput = {
    pagination?: Pick<PaginationRequest, "page" | "pageSize">;
    filters?: Filters;
    globalFilter?: string | null;
    sorts?: SortRequest;
};

/**
 * Turns a list request (`listSchema` from @mono/utils) into Prisma `where`, `orderBy`, `skip` and
 * `take` inputs, rejecting fields outside the allowlists. See the notes module for usage.
 */
export function parseListRouteInput(input: ListRouteInput, options: ListFieldOptions) {
    return {
        filters: parseFilters(input.filters ?? [], options),
        globalFilter: input.globalFilter?.trim() || null,
        pagination: parsePagination(input.pagination ?? { page: 1, pageSize: 20 }),
        sorts: parseSorts(input.sorts ?? [], options.sortFields),
    };
}
