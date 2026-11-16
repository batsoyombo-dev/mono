/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ValidationIssue } from "@mono/error-handling";
import { ValidationError } from "@mono/error-handling";
import type { Filter, Filters, PaginationRequest, SortRequest } from "@mono/utils";
import { parsePagination } from "@mono/utils";

export type { Filter, Filters } from "@mono/utils";

export type FilterFieldType = NonNullable<Filter["type"]>;
export type SortDirection = "asc" | "desc";
/** One Prisma `orderBy` entry; nested ids (`user.name`) become nested objects. */
export type OrderBy = Record<string, any>;

/**
 * Upper bounds on a list request, so one call cannot build an enormous query. Override per
 * endpoint with `limits` when a table really needs more.
 */
export const LIST_LIMITS = {
    maxFilters: 20,
    maxSorts: 5,
    /** Values in one `in` / `notIn` filter. */
    maxArrayValues: 100,
    /** Characters in one text filter value. */
    maxTextLength: 500,
    maxGlobalFilterLength: 200,
    maxPage: 10_000,
    maxPageSize: 100,
};

export type ListLimits = typeof LIST_LIMITS;

/**
 * Which fields a list endpoint lets callers filter and sort by. Both are required: filter ids are
 * Prisma paths, so an open list would let callers query any column or relation (for example
 * `accounts.some.password`). List only fields that are safe to expose.
 */
export type ListFieldOptions = {
    /**
     * Filterable field -> its type, e.g. `{ title: "text", pinned: "boolean", createdAt: "date" }`.
     * The server's type is authoritative: a filter whose `type` disagrees, or whose operator does
     * not fit the type, is rejected with a 422.
     */
    filterFields: Readonly<Record<string, FilterFieldType>>;
    sortFields: readonly string[];
    /** Text fields compared case-sensitively (text filters are case-insensitive by default). */
    caseSensitiveFields?: readonly string[];
    /**
     * Filterable fields whose column is nullable. `blank` / `notBlank` on a number, date or
     * boolean field is only accepted here (it compares with null); on text fields it also
     * matches null when the field is listed.
     */
    nullableFields?: readonly string[];
    /** Order used when the request sends no sorts. */
    defaultSorts?: readonly OrderBy[];
    /**
     * Unique field appended to every order so pages are stable when sort values tie. Skipped
     * when the sorts already include it. Default `{ id: "desc" }`; pass another unique field
     * for a model without `id`, or `null` to turn it off.
     */
    tiebreaker?: { field: string; direction: SortDirection } | null;
    limits?: Partial<ListLimits>;
};

const DEFAULT_TIEBREAKER = { field: "id", direction: "desc" } as const;

const operatorsByType: Record<FilterFieldType, ReadonlySet<Filter["operator"]>> = {
    text: new Set([
        "equals",
        "startsWith",
        "endsWith",
        "contains",
        "not",
        "in",
        "notIn",
        "blank",
        "notBlank",
    ]),
    number: new Set([
        "equals",
        "gt",
        "lt",
        "gte",
        "lte",
        "not",
        "in",
        "notIn",
        "between",
        "blank",
        "notBlank",
    ]),
    date: new Set([
        "equals",
        "gt",
        "lt",
        "gte",
        "lte",
        "not",
        "in",
        "notIn",
        "between",
        "blank",
        "notBlank",
    ]),
    boolean: new Set(["equals", "not", "blank", "notBlank"]),
};

const ARRAY_OPERATORS: ReadonlySet<Filter["operator"]> = new Set(["in", "notIn", "between"]);
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isBlankOperator = (operator: Filter["operator"]) =>
    operator === "blank" || operator === "notBlank";

/** Thrown for one bad part of a list request; becomes a 422 with the issue's path. */
class ListInputError extends Error {
    constructor(
        readonly path: string,
        message: string
    ) {
        super(message);
    }
}

function fail(path: string, message: string): never {
    throw new ListInputError(path, message);
}

function toValidationError(error: unknown): unknown {
    if (!(error instanceof ListInputError)) return error;
    const issue: ValidationIssue = { path: error.path, message: error.message };
    return new ValidationError("Invalid list request", [issue]);
}

/** Runs `fn`, turning a `ListInputError` into a `ValidationError` (422). */
function asValidation<R>(fn: () => R): R {
    try {
        return fn();
    } catch (error) {
        throw toValidationError(error);
    }
}

const DECIMAL = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const EPOCH_MS = /^-?\d+$/;
/** `2024-01-31`, or a date-time with a zone: `2024-01-31T10:00:00Z`, `...T10:00+08:00`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

function parseScalar(
    type: FilterFieldType,
    value: unknown,
    path: string,
    limits: ListLimits
): string | number | boolean | Date {
    switch (type) {
        case "text": {
            if (typeof value !== "string" && typeof value !== "number") {
                fail(path, "Text filter values must be strings");
            }
            const text = String(value);
            if (text.length > limits.maxTextLength) {
                fail(path, `Text filter values are limited to ${limits.maxTextLength} characters`);
            }
            return text;
        }
        case "number": {
            // Strings must be plain decimals: Number() also reads " " as 0 and "0x10" as 16.
            const parsed =
                typeof value === "number"
                    ? value
                    : typeof value === "string" && DECIMAL.test(value)
                      ? Number(value)
                      : Number.NaN;
            if (!Number.isFinite(parsed)) fail(path, "Number filter values must be finite numbers");
            return parsed;
        }
        case "date": {
            // ISO 8601 with an explicit zone when a time is given, or epoch milliseconds, so the
            // result never depends on the server's time zone.
            const parsed =
                value instanceof Date
                    ? value
                    : typeof value === "number"
                      ? new Date(value)
                      : typeof value === "string" && EPOCH_MS.test(value)
                        ? new Date(Number(value))
                        : typeof value === "string" && ISO_DATE.test(value)
                          ? new Date(value)
                          : new Date(Number.NaN);
            if (Number.isNaN(parsed.getTime())) {
                fail(path, "Date filter values must be ISO 8601 dates or epoch milliseconds");
            }
            return parsed;
        }
        case "boolean":
            if (typeof value !== "boolean") fail(path, "Boolean filter values must be booleans");
            return value;
    }
}

type FieldContext = {
    type: FilterFieldType;
    nullable: boolean;
    caseInsensitive: boolean;
    keys: string[];
    path: string;
    limits: ListLimits;
};

/** `{ a: { b: value } }` for keys `["a", "b"]`. */
function nest(keys: readonly string[], value: unknown): Record<string, any> {
    return keys.reduceRight<any>((inner, key) => ({ [key]: inner }), value);
}

function blankClause(operator: Filter["operator"], field: FieldContext): Record<string, any> {
    const { type, nullable, keys, path } = field;
    if (type === "text") {
        if (!nullable) return nest(keys, operator === "blank" ? { equals: "" } : { not: "" });
        return operator === "blank"
            ? { OR: [nest(keys, { equals: "" }), nest(keys, null)] }
            : { AND: [nest(keys, { not: "" }), nest(keys, { not: null })] };
    }
    if (!nullable) fail(`${path}.operator`, `${operator} needs a nullable field`);
    return nest(keys, operator === "blank" ? null : { not: null });
}

function scalarCondition(
    operator: Filter["operator"],
    scalar: string | number | boolean | Date,
    field: FieldContext
): Record<string, any> {
    const mode = field.type === "text" && field.caseInsensitive ? { mode: "insensitive" } : {};
    // Prisma's `mode` sits beside the operator, including `not`.
    return { [operator]: scalar, ...mode };
}

function arrayCondition(
    operator: Filter["operator"],
    values: readonly unknown[],
    field: FieldContext
): Record<string, any> | undefined {
    const { type, path, limits } = field;
    if (operator === "between") {
        if (values.length !== 2) fail(`${path}.value`, "between needs exactly two values");
        return {
            gte: parseScalar(type, values[0], `${path}.value.0`, limits),
            lte: parseScalar(type, values[1], `${path}.value.1`, limits),
        };
    }
    // An empty selection (a data table with nothing ticked) means "no filter".
    if (values.length === 0) return undefined;
    if (values.length > limits.maxArrayValues) {
        fail(`${path}.value`, `${operator} accepts at most ${limits.maxArrayValues} values`);
    }
    const parsed = values.map((entry, index) =>
        parseScalar(type, entry, `${path}.value.${index}`, limits)
    );
    const mode = type === "text" && field.caseInsensitive ? { mode: "insensitive" } : {};
    return { [operator]: parsed, ...mode };
}

function filterClause(
    filter: Filter,
    index: number,
    options: ListFieldOptions,
    limits: ListLimits
): Record<string, any> | undefined {
    const path = `filters.${index}`;
    const { id, operator, value } = filter;
    if (!id) return undefined;

    const type = Object.hasOwn(options.filterFields, id) ? options.filterFields[id] : undefined;
    if (!type) fail(`${path}.id`, `Filtering by ${id} is not allowed`);

    const keys = id.split(".");
    if (keys.some((key) => !key || UNSAFE_KEYS.has(key)))
        fail(`${path}.id`, "Invalid filter field");

    // The server decides the type; a client that disagrees is sending a broken query.
    if (filter.type !== undefined && filter.type !== type) {
        fail(`${path}.type`, `${id} is a ${type} field`);
    }
    if (!operatorsByType[type].has(operator)) {
        fail(`${path}.operator`, `${operator} is not supported for ${type} fields`);
    }

    const field: FieldContext = {
        type,
        nullable: options.nullableFields?.includes(id) ?? false,
        caseInsensitive: !(options.caseSensitiveFields?.includes(id) ?? false),
        keys,
        path,
        limits,
    };

    if (isBlankOperator(operator)) return blankClause(operator, field);
    if (value === undefined || value === null) return undefined;

    if (ARRAY_OPERATORS.has(operator)) {
        if (!Array.isArray(value)) fail(`${path}.value`, `${operator} needs an array value`);
        const condition = arrayCondition(operator, value, field);
        return condition && nest(keys, condition);
    }
    if (Array.isArray(value)) fail(`${path}.value`, `${operator} needs a single value`);

    const scalar = parseScalar(type, value, `${path}.value`, limits);
    return nest(keys, scalarCondition(operator, scalar, field));
}

function resolveLimits(options: Pick<ListFieldOptions, "limits">): ListLimits {
    return { ...LIST_LIMITS, ...options.limits };
}

/**
 * Builds a Prisma `where` from filters. Throws `ValidationError` (422) for a field not in
 * `filterFields`, a `type` that disagrees with the server's, an operator the type does not
 * support, a bad value, or too many filters / values.
 */
export function parseFilters(
    filters: Filters,
    options: Pick<
        ListFieldOptions,
        "filterFields" | "caseSensitiveFields" | "nullableFields" | "limits"
    >
): Record<string, any> {
    return asValidation(() => {
        const limits = resolveLimits(options);
        if (filters.length > limits.maxFilters) {
            fail("filters", `At most ${limits.maxFilters} filters are allowed`);
        }

        const clauses = filters.flatMap((filter, index) => {
            const clause = filterClause(filter, index, options as ListFieldOptions, limits);
            return clause ? [clause] : [];
        });

        const [only] = clauses;
        if (clauses.length === 1 && only) return only;
        return clauses.length === 0 ? {} : { AND: clauses };
    });
}

/**
 * Builds a Prisma `orderBy` (nested ids become nested objects: `user.name` ->
 * `{ user: { name: "asc" } }`). Throws `ValidationError` (422) for a field not in `allowedFields`.
 */
export function parseSorts(
    sorts: SortRequest | undefined,
    allowedFields: readonly string[],
    limits: Pick<ListLimits, "maxSorts"> = LIST_LIMITS
): OrderBy[] {
    return asValidation(() => {
        if (!sorts) return [];
        if (sorts.length > limits.maxSorts) {
            fail("sorts", `At most ${limits.maxSorts} sorts are allowed`);
        }
        const allowed = new Set(allowedFields);
        const seen = new Set<string>();

        return sorts.flatMap(({ id, desc }, index) => {
            if (!id || seen.has(id)) return [];
            if (!allowed.has(id)) fail(`sorts.${index}.id`, `Sorting by ${id} is not allowed`);
            const keys = id.split(".");
            if (keys.some((key) => !key || UNSAFE_KEYS.has(key))) {
                fail(`sorts.${index}.id`, "Invalid sort field");
            }
            seen.add(id);
            return [nest(keys, desc ? "desc" : "asc")];
        });
    });
}

export type ListRouteInput = {
    pagination?: Pick<PaginationRequest, "page" | "pageSize">;
    filters?: Filters;
    globalFilter?: string | null;
    sorts?: SortRequest;
};

function parseListPagination(
    pagination: ListRouteInput["pagination"],
    limits: ListLimits
): Required<PaginationRequest> {
    const { page, pageSize } = pagination ?? { page: 1, pageSize: 20 };
    if (!Number.isInteger(page) || page < 1 || page > limits.maxPage) {
        fail("pagination.page", `page must be an integer from 1 to ${limits.maxPage}`);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > limits.maxPageSize) {
        fail("pagination.pageSize", `pageSize must be an integer from 1 to ${limits.maxPageSize}`);
    }
    return parsePagination({ page, pageSize });
}

/**
 * Turns a list request (`listSchema` from @mono/utils) into Prisma `where`, `orderBy`, `skip` and
 * `take` inputs, rejecting fields outside the allowlists with a 422. `sorts` always ends with a
 * unique tiebreaker (`id desc` by default), so offset pages never repeat or skip rows when sort
 * values tie. See the notes module for usage.
 */
export function parseListRouteInput(input: ListRouteInput, options: ListFieldOptions) {
    const limits = resolveLimits(options);

    return asValidation(() => {
        const globalFilter = input.globalFilter?.trim() || null;
        if (globalFilter && globalFilter.length > limits.maxGlobalFilterLength) {
            fail(
                "globalFilter",
                `globalFilter is limited to ${limits.maxGlobalFilterLength} characters`
            );
        }

        const requested = parseSorts(input.sorts ?? [], options.sortFields, limits);
        const sorts = requested.length ? requested : [...(options.defaultSorts ?? [])];
        const tiebreaker =
            options.tiebreaker === undefined ? DEFAULT_TIEBREAKER : options.tiebreaker;
        if (tiebreaker && !sorts.some((sort) => Object.hasOwn(sort, tiebreaker.field))) {
            sorts.push({ [tiebreaker.field]: tiebreaker.direction });
        }

        return {
            filters: parseFilters(input.filters ?? [], { ...options, limits }),
            globalFilter,
            pagination: parseListPagination(input.pagination, limits),
            sorts,
        };
    });
}
