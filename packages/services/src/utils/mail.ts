import { config } from "@mono/global-config";
import { logger } from "@mono/logger";
import nodemailer, { Transporter } from "nodemailer";

export interface EmailConfig {
    provider: "smtp";
    fromEmail: string;
    fromName: string;
    smtp: {
        host: string;
        user: string;
        password: string;
    };
    aws: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
    };
    server: {
        port: number;
        baseUrl: string;
    };
}

class EmailConfigManager {
    private transporter: Transporter | null = null;
    private config: EmailConfig;

    constructor() {
        this.config = this.loadConfig();
        this.initializeTransporter();
    }

    private loadConfig(): EmailConfig {
        return {
            provider: (config.MAIL_PROVIDER ?? "smtp") as EmailConfig["provider"],
            fromEmail: config.MAIL_FROM_ADDRESS,
            fromName: config.MAIL_FROM_NAME || "Email Service",
            smtp: {
                host: config.MAIL_HOST,
                user: config.MAIL_USERNAME,
                password: config.MAIL_PASSWORD,
            },
            aws: {
                accessKeyId: config.MAIL_USERNAME,
                secretAccessKey: config.MAIL_PASSWORD,
                region: config.MAIL_REGION,
            },
            server: {
                port: config.SERVER_PORT || 3000,
                baseUrl: config.BASE_URL,
            },
        };
    }

    private initializeTransporter(): void {
        switch (this.config.provider) {
            case "smtp":
                this.setupSMTPTransporter();
                break;
        }
    }

    private setupSMTPTransporter(): void {
        logger.info("🔧 Setting up SMTP transporter for development...");

        this.transporter = nodemailer.createTransport({
            host: this.config.smtp.host,
            auth: {
                user: this.config.smtp.user,
                pass: this.config.smtp.password,
            },
            tls: {
                rejectUnauthorized: false,
            },
        });
    }

    public async verifyConnection(): Promise<boolean> {
        try {
            if (!this.transporter) {
                throw new Error("Transporter not initialized");
            }

            await this.transporter.verify();
            logger.info(`✅ Email service ready (${this.config.provider})`);
            return true;
        } catch (error) {
            logger.error("❌ Email service verification failed:", (error as Error).message);
            return false;
        }
    }

    public getTransporter(): Transporter {
        if (!this.transporter) {
            throw new Error("Transporter not initialized");
        }
        return this.transporter;
    }

    public getConfig(): EmailConfig {
        return this.config;
    }

    public getProvider(): string {
        return this.config.provider;
    }
}

export const emailConfig = new EmailConfigManager();
