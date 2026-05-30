/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { logger } from "@mono/logger";
import handlebars from "handlebars";
import type { Transporter } from "nodemailer";

import type {
    BulkEmailItem,
    BulkEmailResult,
    ConnectionTestResult,
    EmailResult,
    EmailWithAttachmentsOptions,
    HtmlEmailOptions,
    PlainTextEmailOptions,
    TemplateEmailOptions,
} from "./types";
import { emailConfig } from "../../utils";

const __filename__ = fileURLToPath(import.meta.url);
const __dirname__ = dirname(__filename__);

class MailClient {
    private transporter: Transporter;
    private fromEmail: string;
    private fromName: string;

    constructor() {
        this.transporter = emailConfig.getTransporter();
        const config = emailConfig.getConfig();
        this.fromEmail = config.fromEmail;
        this.fromName = config.fromName;
    }

    /**
     * Send plain text email
     */
    public async sendPlainText(options: PlainTextEmailOptions): Promise<EmailResult> {
        try {
            const mailOptions = {
                from: `${this.fromName} <${options.from || this.fromEmail}>`,
                to: options.to,
                subject: options.subject,
                text: options.text,
            };

            const result = await this.transporter.sendMail(mailOptions);

            return {
                success: true,
                messageId: result.messageId,
                message: "Plain text email sent successfully",
                provider: emailConfig.getProvider(),
            };
        } catch (error) {
            logger.error("❌ Error sending plain text email:", error);
            throw {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Send HTML email
     */
    public async sendHtml(options: HtmlEmailOptions): Promise<EmailResult> {
        try {
            const mailOptions = {
                from: `${this.fromName} <${options.from || this.fromEmail}>`,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text || this.stripHtml(options.html),
            };

            const result = await this.transporter.sendMail(mailOptions);

            return {
                success: true,
                messageId: result.messageId,
                message: "HTML email sent successfully",
                provider: emailConfig.getProvider(),
            };
        } catch (error) {
            logger.error("❌ Error sending HTML email:", error);
            throw {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Send templated email
     */
    public async sendTemplate(options: TemplateEmailOptions): Promise<EmailResult> {
        try {
            const html = await this.renderTemplate(options.template, options.data);

            const mailOptions = {
                from: `${this.fromName} <${options.from || this.fromEmail}>`,
                to: options.to,
                subject: options.subject,
                html,
                text: this.stripHtml(html),
            };

            const result = await this.transporter.sendMail(mailOptions);

            return {
                success: true,
                messageId: result.messageId,
                message: "Templated email sent successfully",
                template: options.template,
                provider: emailConfig.getProvider(),
            };
        } catch (error) {
            logger.error("❌ Error sending templated email:", error);
            throw {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Send bulk emails with rate limiting
     */
    public async sendBulk(emails: BulkEmailItem[], delay: number = 100): Promise<BulkEmailResult> {
        const results: Array<EmailResult & { index: number; email: string }> = [];
        const errors: Array<{ index: number; email: string; error: string }> = [];

        for (const [index, email] of emails.entries()) {
            try {
                let result: EmailResult;

                if ("template" in email) {
                    result = await this.sendTemplate(email);
                } else if ("html" in email) {
                    result = await this.sendHtml(email);
                } else {
                    result = await this.sendPlainText(email);
                }

                results.push({
                    index,
                    email: email.to,
                    ...result,
                });

                // Rate limiting - wait between emails
                if (index < emails.length - 1) {
                    await this.delay(delay);
                }
            } catch (error) {
                errors.push({
                    index,
                    email: email.to,
                    error: (error as any).error || (error as Error).message,
                });
            }
        }

        return {
            success: errors.length === 0,
            total: emails.length,
            sent: results.length,
            failed: errors.length,
            provider: emailConfig.getProvider(),
            results,
            errors,
        };
    }

    /**
     * Send email with attachments
     */
    public async sendWithAttachments(options: EmailWithAttachmentsOptions): Promise<EmailResult> {
        try {
            const mailOptions = {
                from: `${this.fromName} <${options.from || this.fromEmail}>`,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
                attachments: options.attachments?.map((attachment) => ({
                    filename: attachment.filename,
                    content: attachment.content,
                    contentType: attachment.contentType || "application/octet-stream",
                })),
            };

            const result = await this.transporter.sendMail(mailOptions);

            return {
                success: true,
                messageId: result.messageId,
                message: "Email with attachments sent successfully",
                attachmentCount: options.attachments?.length || 0,
                provider: emailConfig.getProvider(),
            };
        } catch (error) {
            logger.error("❌ Error sending email with attachments:", error);
            throw {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Render email template
     */
    private async renderTemplate(templateName: string, data: Record<string, any>): Promise<string> {
        try {
            const templatePath = join(__dirname__, "../templates", `${templateName}.hbs`);
            const templateContent = await readFile(templatePath, "utf8");
            const template = handlebars.compile(templateContent);

            // Add some default data
            const templateData = {
                ...data,
                currentYear: new Date().getFullYear(),
                currentDate: new Date().toLocaleDateString(),
                baseUrl: emailConfig.getConfig().server.baseUrl,
            };

            return template(templateData);
        } catch (error) {
            throw new Error(`Template rendering failed: ${(error as Error).message}`);
        }
    }

    /**
     * Strip HTML tags from text
     */
    private stripHtml(html: string): string {
        return html
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    /**
     * Delay execution
     */
    private async delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Test email connection
     */
    public async testConnection(): Promise<ConnectionTestResult> {
        try {
            await this.transporter.verify();
            return {
                success: true,
                message: "Email service connection verified",
                provider: emailConfig.getProvider(),
            };
        } catch (error) {
            logger.error("❌ Connection test failed:", error);
            throw {
                success: false,
                message: "Connection test failed",
                provider: emailConfig.getProvider(),
                error: (error as Error).message,
            };
        }
    }
}

export const mailClient = new MailClient();
