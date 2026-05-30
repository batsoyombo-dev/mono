import {
    DeleteObjectCommand,
    ObjectCannedACL,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { config } from "@mono/global-config";

export type S3StorageConfigProps = {
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    visibility: ObjectCannedACL;
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
                ACL: this.config.visibility,
                Body: file,
            })
        );
    }

    public has(_path: string, _filename: string) {
        return false;
    }

    public delete(path: string) {
        return this.client.send(
            new DeleteObjectCommand({
                Bucket: this.config.bucketName,
                Key: path,
            })
        );
    }

    public get(_path: string, _filename: string) {
        return Buffer.from("dwq");
    }
}

export const s3Storage = new S3Storage({
    accessKeyId: config.AWS_ACCESS_KEY,
    bucketName: config.AWS_BUCKET_NAME,
    region: config.AWS_REGION,
    secretAccessKey: config.AWS_SECRET_KEY,
    visibility: "public-read",
});
