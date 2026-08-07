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

    constructor(private config: S3StorageConfigProps) {
        this.client = new S3Client({
            region: this.config.region,
            credentials: {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            },
        });
    }

    public put(path: string, file: Buffer) {
        return this.client.send(
            new PutObjectCommand({
                Bucket: this.config.bucketName,
                Key: path,
                ...(this.config.visibility ? { ACL: this.config.visibility } : {}),
                Body: file,
            })
        );
    }

    public async has(path: string): Promise<boolean> {
        try {
            await this.client.send(
                new HeadObjectCommand({
                    Bucket: this.config.bucketName,
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
                Bucket: this.config.bucketName,
                Key: path,
            })
        );
    }

    public async get(path: string): Promise<Buffer> {
        const response = await this.client.send(
            new GetObjectCommand({
                Bucket: this.config.bucketName,
                Key: path,
            })
        );

        if (!response.Body) {
            throw new Error(`S3 object ${path} has no response body`);
        }

        return Buffer.from(await response.Body.transformToByteArray());
    }
}

export const s3Storage = new S3Storage({
    accessKeyId: config.AWS_ACCESS_KEY,
    bucketName: config.AWS_BUCKET_NAME,
    region: config.AWS_REGION,
    secretAccessKey: config.AWS_SECRET_KEY,
});
