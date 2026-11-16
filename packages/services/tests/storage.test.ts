import { describe, expect, test } from "bun:test";

import { createStorage, S3Storage, s3ClientConfig } from "../src/clients/s3-storage";

describe("s3 storage config", () => {
    test("is off without a bucket and needs a region with one", () => {
        expect(createStorage(undefined)).toBeNull();
        expect(createStorage({ region: "eu-west-1" })).toBeNull();
        expect(() => createStorage({ bucketName: "b" })).toThrow(/region/);
        expect(createStorage({ bucketName: "b", region: "eu-west-1" })).toBeInstanceOf(S3Storage);
    });

    test("uses static credentials only when both keys are set", () => {
        expect(s3ClientConfig({ bucketName: "b", region: "r" })).toEqual({ region: "r" });
        expect(
            s3ClientConfig({ bucketName: "b", region: "r", accessKeyId: "k", secretAccessKey: "s" })
        ).toEqual({ region: "r", credentials: { accessKeyId: "k", secretAccessKey: "s" } });
        expect(() => s3ClientConfig({ bucketName: "b", region: "r", accessKeyId: "k" })).toThrow();
    });

    test("an endpoint switches to path-style URLs", () => {
        expect(
            s3ClientConfig({ bucketName: "b", region: "r", endpoint: "http://localhost:9000" })
        ).toEqual({ region: "r", endpoint: "http://localhost:9000", forcePathStyle: true });
    });
});
