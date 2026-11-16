type ResponseOptions = Omit<ResponseInit, "status">;

type ErrorBody<TIssues> = {
    success: false;
    status: number;
    error: {
        message: string;
        issues?: TIssues;
    };
};

function json<T>(body: T, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");

    return new Response(
        JSON.stringify(body, (_, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value
        ),
        {
            ...init,
            headers,
        }
    );
}

export function success<T>(data: T, status = 200, options?: ResponseOptions): Response {
    return json(
        {
            success: true as const,
            status,
            data,
        },
        { ...options, status }
    );
}

export function failure<TIssues = undefined>(
    status: number,
    message: string,
    issues?: TIssues,
    options?: ResponseOptions
): Response {
    const error: ErrorBody<TIssues>["error"] = { message };

    if (issues !== undefined) {
        error.issues = issues;
    }

    return json<ErrorBody<TIssues>>(
        {
            success: false,
            status,
            error,
        },
        { ...options, status }
    );
}
