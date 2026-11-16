import type { ObjectCannedACL, S3ClientConfig } from "@aws-sdk/client-s3";
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from "@aws-sdk/client-s3";

import { env } from "@mono/env";

export type S3StorageConfigProps = {
    bucketName: string;
    region: string;
    /**
     * Static credentials. Leave both unset to use the AWS SDK's default credential chain
     * (environment, IAM role, ~/.aws); setting only one is an error.
     */
    accessKeyId?: string;
    secretAccessKey?: string;
    /** S3-compatible endpoint (MinIO, R2). Uses path-style URLs. Unset means AWS. */
    endpoint?: string;
    visibility?: ObjectCannedACL;
};

/** The S3Client options for a storage config. Pure, so it can be unit tested. */
export function s3ClientConfig(options: S3StorageConfigProps): S3ClientConfig {
    const { region, accessKeyId, secretAccessKey, endpoint } = options;
    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
        throw new Error("Set both accessKeyId and secretAccessKey, or neither");
    }

    return {
        region,
        ...(accessKeyId && secretAccessKey
            ? { credentials: { accessKeyId, secretAccessKey } }
            : {}),
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    };
}

export class S3Storage {
    client: S3Client;

    constructor(private readonly options: S3StorageConfigProps) {
        this.client = new S3Client(s3ClientConfig(options));
    }

    public put(path: string, file: Buffer) {
        return this.client.send(
            new PutObjectCommand({
                Bucket: this.options.bucketName,
                Key: path,
                ...(this.options.visibility ? { ACL: this.options.visibility } : {}),
                Body: file,
            })
        );
    }

    public async has(path: string): Promise<boolean> {
        try {
            await this.client.send(
                new HeadObjectCommand({
                    Bucket: this.options.bucketName,
                    Key: path,
                })
            );
            return true;
        } catch (error) {
            if (
                error instanceof S3ServiceException &&
                ["NotFound", "NoSuchKey", "NoSuchBucket"].includes(error.name)
            ) {
                return false;
            }
            throw error;
        }
    }

    public delete(path: string) {
        return this.client.send(
            new DeleteObjectCommand({
                Bucket: this.options.bucketName,
                Key: path,
            })
        );
    }

    public async get(path: string): Promise<Buffer> {
        const response = await this.client.send(
            new GetObjectCommand({
                Bucket: this.options.bucketName,
                Key: path,
            })
        );

        if (!response.Body) {
            throw new Error(`S3 object ${path} has no response body`);
        }

        return Buffer.from(await response.Body.transformToByteArray());
    }
}

/**
 * Returns S3 storage, or `null` when no bucket is configured. Storage is on whenever
 * `bucketName` is set; a bucket without a region is an error (`env.storage` checks the same).
 */
export function createStorage(
    options: Partial<S3StorageConfigProps> | undefined
): S3Storage | null {
    const { bucketName, region, ...rest } = options ?? {};
    if (!bucketName) return null;
    if (!region) throw new Error("S3 storage needs a region when a bucket is set");

    return new S3Storage({ bucketName, region, ...rest });
}

/** The app's S3 storage, or `null` when `AWS_BUCKET_NAME` is not set. */
export const storage: S3Storage | null = createStorage({
    bucketName: env.storage.AWS_BUCKET_NAME,
    region: env.storage.AWS_REGION,
    accessKeyId: env.storage.AWS_ACCESS_KEY,
    secretAccessKey: env.storage.AWS_SECRET_KEY,
    endpoint: env.storage.AWS_ENDPOINT,
});
