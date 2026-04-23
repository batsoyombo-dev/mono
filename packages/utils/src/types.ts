export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

export type SortRequest = Record<string, "desc" | "asc">[];

export type PaginationRequest = {
    page: number;
    pageSize: number;
    skip?: number;
    cursor?: number;
};

export type PaginationResponse = {
    page: number;
    pageSize: number;
    total?: number;
    totalPages?: number;
    nextCursor?: number;
};
