import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import handlebars from "handlebars";
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";

import { env } from "@mono/global-config";

import type {
    EmailResult,
    EmailWithAttachmentsOptions,
    HtmlEmailOptions,
    PlainTextEmailOptions,
    TemplateEmailOptions,
} from "./types";

// In development this resolves next to the source; app builds copy templates into dist/templates.
const templatesDir = resolve(dirname(fileURLToPath(import.meta.url)), "templates");
const templateNamePattern = /^[a-zA-Z0-9_-]+$/;
const compiledTemplates = new Map<string, HandlebarsTemplateDelegate>();

function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export type MailClientOptions = {
    smtp: {
        host: string;
        port: number;
        /** TLS on: implicit TLS on port 465, STARTTLS required on any other port. */
        encryption: boolean;
        username?: string;
        password?: string;
    };
    /** Default sender when a message sets no `from`. */
    from: { name: string; address: string };
    /** Passed to every template as `appName` and `baseUrl`. */
    appName: string;
    baseUrl: string;
};

export type MailClient = ReturnType<typeof createMailClient>;

async function renderTemplate(name: string, data: Record<string, unknown>): Promise<string> {
    if (!templateNamePattern.test(name)) {
        throw new Error(
            "Template name may contain only letters, numbers, underscores, and hyphens"
        );
    }

    let template = compiledTemplates.get(name);
    if (!template) {
        const source = await readFile(resolve(templatesDir, `${name}.hbs`), "utf8");
        template = handlebars.compile(source);
        compiledTemplates.set(name, template);
    }

    return template({ currentYear: new Date().getFullYear(), ...data });
}

/** Sends email over SMTP. The SMTP connection is created on the first send, not here. */
export function createMailClient({ smtp, from, appName, baseUrl }: MailClientOptions) {
    let transporter: Transporter | null = null;

    const getTransporter = (): Transporter =>
        (transporter ??= nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.encryption && smtp.port === 465,
            requireTLS: smtp.encryption && smtp.port !== 465,
            auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
        }));

    async function send(options: SendMailOptions): Promise<EmailResult> {
        const result = await getTransporter().sendMail({ ...options, from: options.from ?? from });
        return { messageId: result.messageId };
    }

    return {
        sendPlainText({ to, subject, from, text }: PlainTextEmailOptions) {
            return send({ to, subject, from, text });
        },

        sendHtml({ to, subject, from, html, text }: HtmlEmailOptions) {
            return send({ to, subject, from, html, text: text ?? stripHtml(html) });
        },

        async sendTemplate({ to, subject, from, template, data }: TemplateEmailOptions) {
            const html = await renderTemplate(template, { appName, baseUrl, ...data });
            return send({ to, subject, from, html, text: stripHtml(html) });
        },

        sendWithAttachments({
            to,
            subject,
            from,
            text,
            html,
            attachments,
        }: EmailWithAttachmentsOptions) {
            return send({ to, subject, from, text, html, attachments });
        },

        /** Verifies the SMTP connection and credentials. */
        async verify(): Promise<void> {
            await getTransporter().verify();
        },
    };
}

/** The app's mail client, configured from `env.mail` and `env.app`. */
export const mailClient: MailClient = createMailClient({
    smtp: {
        host: env.mail.MAIL_HOST,
        port: env.mail.MAIL_PORT,
        encryption: env.mail.MAIL_ENCRYPTION,
        username: env.mail.MAIL_USERNAME,
        password: env.mail.MAIL_PASSWORD,
    },
    from: { name: env.mail.MAIL_FROM_NAME, address: env.mail.MAIL_FROM_ADDRESS },
    appName: env.app.APP_NAME,
    baseUrl: env.app.BASE_URL,
});
