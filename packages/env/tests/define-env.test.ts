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
        expect(config.MAIL_ENCRYPTION).toBe("none");
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

describe("env rules", () => {
    const placeholder = "replace-with-a-secret-of-at-least-32-characters";

    test("refuses the placeholder auth secret only in deployed environments", () => {
        const parse = (NODE_ENV: string) =>
            defineEnv("api", {
                groups: ["auth"],
                source: { ...base, NODE_ENV, BETTER_AUTH_SECRET: placeholder },
            });

        expect(parse("development").BETTER_AUTH_SECRET).toBe(placeholder);
        expect(() => parse("production")).toThrow(/placeholder/);
        expect(() => parse("staging")).toThrow(/placeholder/);
    });

    test("storage variables are all-or-none", () => {
        const parse = (source: Record<string, string>) =>
            defineEnv("api", { groups: ["storage"], source: { ...base, ...source } });

        expect(parse({}).AWS_BUCKET_NAME).toBeUndefined();
        expect(parse({ AWS_BUCKET_NAME: "b", AWS_REGION: "eu-west-1" }).AWS_REGION).toBe(
            "eu-west-1"
        );
        expect(() => parse({ AWS_BUCKET_NAME: "b" })).toThrow(/AWS_REGION/);
        expect(() => parse({ AWS_BUCKET_NAME: "b", AWS_REGION: "r", AWS_ACCESS_KEY: "k" })).toThrow(
            /AWS_SECRET_KEY/
        );
        expect(() => parse({ AWS_ACCESS_KEY: "k", AWS_SECRET_KEY: "s" })).toThrow(
            /AWS_BUCKET_NAME/
        );
    });

    test("normalizes CORS origins and rejects non-http URLs", () => {
        const parse = (CORS_ORIGINS: string) =>
            defineEnv("api", { groups: ["app"], source: { ...base, CORS_ORIGINS } });

        expect(parse("http://localhost:5173/, https://app.test/path").CORS_ORIGINS).toEqual([
            "http://localhost:5173",
            "https://app.test",
        ]);
        expect(() => parse("javascript:alert(1)")).toThrow();
        expect(() => parse("localhost:3000")).toThrow();
    });

    test("TRUSTED_PROXIES accepts IPs and CIDR ranges only", () => {
        const parse = (TRUSTED_PROXIES: string) =>
            defineEnv("api", { groups: ["auth"], source: { ...base, TRUSTED_PROXIES } });

        expect(parse("10.0.0.1, 10.0.0.0/8, fd00::/8").TRUSTED_PROXIES).toEqual([
            "10.0.0.1",
            "10.0.0.0/8",
            "fd00::/8",
        ]);
        expect(() => parse("10.0.0.0/33")).toThrow();
        expect(() => parse("load-balancer")).toThrow();
    });
});
