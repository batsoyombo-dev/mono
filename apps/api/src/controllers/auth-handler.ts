export type AuthSession = {
    user: {
        id: string | number;
    };
};

export type AuthHandler = {
    handler(request: Request): Response | Promise<Response>;
    getSession?(headers: Headers): Promise<AuthSession | null>;
};
