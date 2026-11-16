export type AuthSession = {
    user: {
        id: string | number;
        email: string;
        emailVerified: boolean;
    };
};

/** What the API needs from Better Auth: its route handler and a session reader. */
export type AuthHandler = {
    handler(request: Request): Response | Promise<Response>;
    getSession(headers: Headers): Promise<AuthSession | null>;
};
