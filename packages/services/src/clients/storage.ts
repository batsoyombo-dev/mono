import { env } from "@mono/env";

import type { S3Storage } from "./s3-storage";
import { createStorage } from "./s3-storage";

export * from "./s3-storage";

/** The app's S3 storage, or `null` when `AWS_BUCKET_NAME` is not set. */
export const storage: S3Storage | null = createStorage({
    bucketName: env.storage.AWS_BUCKET_NAME,
    region: env.storage.AWS_REGION,
    accessKeyId: env.storage.AWS_ACCESS_KEY,
    secretAccessKey: env.storage.AWS_SECRET_KEY,
    endpoint: env.storage.AWS_ENDPOINT,
});
