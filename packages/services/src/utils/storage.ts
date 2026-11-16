import type { ObjectCannedACL } from "@aws-sdk/client-s3";
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
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    visibility?: ObjectCannedACL;
};

export class S3Storage {
    client: S3Client;

    constructor(private readonly options: S3StorageConfigProps) {
        this.client = new S3Client({
            region: this.options.region,
            credentials: {
                accessKeyId: this.options.accessKeyId,
                secretAccessKey: this.options.secretAccessKey,
            },
        });
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

/** Returns S3 storage, or `null` when the app has not configured it (all fields optional). */
export function createStorage(
    options: Partial<S3StorageConfigProps> | undefined
): S3Storage | null {
    const { accessKeyId, secretAccessKey, bucketName, region, visibility } = options ?? {};
    if (!accessKeyId || !secretAccessKey || !bucketName || !region) return null;

    return new S3Storage({ accessKeyId, secretAccessKey, bucketName, region, visibility });
}

/** The app's S3 storage, or `null` when the `AWS_*` variables are not set. */
export const storage: S3Storage | null = createStorage({
    accessKeyId: env.storage.AWS_ACCESS_KEY,
    secretAccessKey: env.storage.AWS_SECRET_KEY,
    bucketName: env.storage.AWS_BUCKET_NAME,
    region: env.storage.AWS_REGION,
});
