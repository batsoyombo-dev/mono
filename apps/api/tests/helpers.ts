import { createApp } from "../src/app";

export type TestAppOptions = Parameters<typeof createApp>[0];

/**
 * A stand-in service whose every operation rejects, so a test fails loudly when a route calls
 * something the test did not fake.
 */
export function unimplemented<T extends object>(name: string): T {
    return new Proxy({} as T, {
        get: (_target, operation) =>
            // Not a thenable, so `await unimplemented(...)` does not call it.
            operation === "then"
                ? undefined
                : async () => {
                      throw new Error(`${name}.${String(operation)} is not faked in this test`);
                  },
    });
}

/** Every dependency createApp needs, faked; override the ones a test exercises. */
export function createTestApp(overrides: Partial<TestAppOptions> = {}) {
    return createApp({
        allowedOrigins: [],
        readiness: {},
        auth: { handler: async () => new Response("auth"), getSession: async () => null },
        users: unimplemented("users"),
        notes: unimplemented("notes"),
        queues: unimplemented("queues"),
        adminEmails: [],
        ...overrides,
    });
}
