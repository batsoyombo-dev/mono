import type { z } from "zod";

import type {
    filterOperatorSchema,
    filterTypeSchema,
    paginationSchema,
    singleFilterSchema,
    singleSortSchema,
} from "./schemas";

export type FilterOperator = z.infer<typeof filterOperatorSchema>;
export type FilterType = z.infer<typeof filterTypeSchema>;
export type FilterValue =
    string | number | boolean | Date | string[] | number[] | boolean[] | Date[];
export type Filter = Omit<z.infer<typeof singleFilterSchema>, "value"> & {
    value: FilterValue;
};
export type Filters = Filter[];
export type SortRequest = z.infer<typeof singleSortSchema>[];
export type PaginationRequest = z.infer<typeof paginationSchema> & { skip?: number };
export type PaginationResponse = {
    page: number;
    pageSize: number;
    total?: number;
    totalPages?: number;
};
