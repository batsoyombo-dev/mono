import type { ObjectCannedACL } from "@aws-sdk/client-s3";
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from "@aws-sdk/client-s3";
import { config } from "@mono/global-config";

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

let storage: S3Storage | null = null;

/** Returns the shared S3 storage, failing loudly when the AWS_* variables are not configured. */
export function getStorage(): S3Storage {
    if (storage) return storage;

    const { AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_BUCKET_NAME, AWS_REGION } = config;
    if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY || !AWS_BUCKET_NAME || !AWS_REGION) {
        throw new Error("S3 storage is not configured: set the AWS_* environment variables");
    }

    storage = new S3Storage({
        accessKeyId: AWS_ACCESS_KEY,
        secretAccessKey: AWS_SECRET_KEY,
        bucketName: AWS_BUCKET_NAME,
        region: AWS_REGION,
    });
    return storage;
}
