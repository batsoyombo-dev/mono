import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";

import { env } from "@mono/env";

import type { MailEncryption, SmtpTimeouts } from "./smtp";
import { DEFAULT_SMTP_TIMEOUTS, tlsOptions } from "./smtp";
import { renderTemplate } from "./templates";
import type {
    EmailResult,
    EmailWithAttachmentsOptions,
    HtmlEmailOptions,
    PlainTextEmailOptions,
    TemplateEmailOptions,
} from "./types";

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
        /**
         * `ssl`: implicit TLS. `starttls`: plain connection that must upgrade with STARTTLS.
         * `none`: no TLS, even if the server offers it. `auto`: `ssl` on port 465, else `starttls`.
         */
        encryption: MailEncryption;
        username?: string;
        password?: string;
        /** Milliseconds; defaults keep a hung SMTP server from outliving a shutdown grace period. */
        timeouts?: Partial<SmtpTimeouts>;
    };
    /** Default sender when a message sets no `from`. */
    from: { name: string; address: string };
    /** Passed to every template as `appName` and `baseUrl`. */
    appName: string;
    baseUrl: string;
};

export type MailClient = ReturnType<typeof createMailClient>;

/** Sends email over SMTP. The SMTP connection is created on the first send, not here. */
export function createMailClient({ smtp, from, appName, baseUrl }: MailClientOptions) {
    let transporter: Transporter | null = null;

    const getTransporter = (): Transporter =>
        (transporter ??= nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            ...tlsOptions(smtp.encryption, smtp.port),
            connectionTimeout: smtp.timeouts?.connection ?? DEFAULT_SMTP_TIMEOUTS.connection,
            greetingTimeout: smtp.timeouts?.greeting ?? DEFAULT_SMTP_TIMEOUTS.greeting,
            socketTimeout: smtp.timeouts?.socket ?? DEFAULT_SMTP_TIMEOUTS.socket,
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
