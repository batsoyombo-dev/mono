import type { PaginationRequest, PaginationResponse } from "./types";

export const parsePagination = (pagination: Omit<PaginationRequest, "skip">) => {
    const { page, pageSize } = pagination;

    return {
        page,
        pageSize,
        skip: (page - 1) * pageSize,
    } satisfies Required<PaginationRequest>;
};

export const serializePagination = <T>(
    pagination: PaginationRequest,
    collection: T[],
    total = 0
) => ({
    collection,
    meta: {
        total,
        totalPages: Math.ceil(total / pagination.pageSize),
        page: pagination.page,
        pageSize: pagination.pageSize,
    } satisfies PaginationResponse,
});
