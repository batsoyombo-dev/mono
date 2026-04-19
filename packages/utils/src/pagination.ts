import { PaginationRequest, PaginationResponse } from "@mk/types";

export const parsePagination = (
    pagination: Omit<PaginationRequest, "skip">,
    rewriteCursor?: number | null
) => {
    const { page, pageSize, cursor } = pagination;

    return {
        page,
        pageSize,
        skip: page ? (page - 1) * pageSize : undefined,
        cursor: rewriteCursor ?? cursor,
    } as Required<PaginationRequest>;
};

export const serializePagination = <T extends { id?: number }>(
    pagination: PaginationRequest,
    collection: T[],
    total = 0
) => {
    const totalPages = Math.ceil(total / pagination.pageSize);

    const nextCursor = collection.length > pagination.pageSize ? collection.pop()?.id : null;

    return {
        collection,
        meta: {
            total,
            totalPages,
            page: pagination.page,
            pageSize: nextCursor ? pagination.pageSize - 1 : pagination.pageSize,
            nextCursor: nextCursor ?? undefined,
        } satisfies PaginationResponse,
    };
};

export const getCursorPaginationQuery = <T extends Record<string, unknown>>(
    pagination: PaginationRequest,
    field: keyof T,
    sort: "asc" | "desc",
    sortField?: keyof T
) => {
    const cursor = pagination.cursor ?? null;
    const pageSize = pagination.pageSize + 1;

    if (!cursor)
        return {
            cursor: undefined as T | undefined,
            skip: 0,
            orderBy: { [sortField ?? field]: sort },
            take: pageSize,
        };

    return {
        cursor: { [field]: cursor } as T,
        take: sort === "asc" ? -pageSize : pageSize,
        skip: 1,
        orderBy: { [sortField ?? field]: sort },
    };
};
