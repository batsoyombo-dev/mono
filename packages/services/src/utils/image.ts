import sharp from "sharp";

export class ImageProcessor {
    private processor: sharp.Sharp;

    constructor(fileBuffer: Buffer) {
        this.processor = sharp(fileBuffer);
    }

    resize(width: number, height: number, fit: keyof sharp.FitEnum = "inside") {
        this.processor = this.processor.resize(width, height, { fit });
        return this;
    }

    compress(quality: number = 80) {
        this.processor = this.processor.jpeg({ quality });
        return this;
    }

    toFormat(format: "jpeg" | "png" | "webp", quality = 80) {
        if (format === "jpeg") {
            this.processor = this.processor.jpeg({ quality });
        } else if (format === "png") {
            this.processor = this.processor.png({ quality });
        } else if (format === "webp") {
            this.processor = this.processor.webp({ quality });
        }
        return this;
    }

    async toBuffer(): Promise<Buffer> {
        return await this.processor.toBuffer();
    }
}
