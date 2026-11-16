import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { commaSeparated, defineEnv, optional, port } from "../src";

const base = {
    BASE_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://localhost:5432/mono",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_SECRET: "x".repeat(32),
    MAIL_HOST: "localhost",
    MAIL_PORT: "1025",
    MAIL_FROM_NAME: "Mono",
    MAIL_FROM_ADDRESS: "no-reply@example.com",
};

describe("defineEnv", () => {
    test("parses the chosen groups plus app variables into one flat object", () => {
        const config = defineEnv("test", {
            groups: ["database", "redis"],
            extend: { SERVER_PORT: port.default(3000), ORIGINS: commaSeparated(z.url()) },
            source: { ...base, ORIGINS: "http://a.test, ,http://b.test", UNRELATED: "dropped" },
        });

        expect(config).toEqual({
            DATABASE_URL: base.DATABASE_URL,
            REDIS_URL: base.REDIS_URL,
            SERVER_PORT: 3000,
            ORIGINS: ["http://a.test", "http://b.test"],
        });
        expect(Object.isFrozen(config)).toBe(true);
    });

    test("defaults to every group and treats blank optional values as unset", () => {
        const config = defineEnv("test", {
            extend: { EXTRA_ID: optional(z.string()) },
            source: { ...base, EXTRA_ID: "", MAIL_ENCRYPTION: "false" },
        });

        expect(config.MAIL_PORT).toBe(1025);
        expect(config.MAIL_ENCRYPTION).toBe(false);
        expect(config.NODE_ENV).toBe("development");
        expect(config.CORS_ORIGINS).toEqual([]);
        expect(config.EXTRA_ID).toBeUndefined();
    });

    test("lists every invalid variable in one error, naming the owner", () => {
        const parse = () =>
            defineEnv("api", {
                groups: ["database", "mail"],
                extend: { SERVER_PORT: port },
                source: { MAIL_PORT: "99999", SERVER_PORT: "abc" },
            });

        expect(parse).toThrow("Invalid environment variables for api");
        expect(parse).toThrow(/DATABASE_URL[\s\S]*MAIL_PORT[\s\S]*SERVER_PORT/);
    });
});
