import nodemailer, { type Transporter } from "nodemailer";

import { config } from "@mono/global-config";

let transporter: Transporter | null = null;

/** Lazily creates the shared SMTP transporter so importing services never opens a connection. */
export function getMailTransporter(): Transporter {
    transporter ??= nodemailer.createTransport({
        host: config.MAIL_HOST,
        port: config.MAIL_PORT,
        secure: config.MAIL_ENCRYPTION && config.MAIL_PORT === 465,
        requireTLS: config.MAIL_ENCRYPTION && config.MAIL_PORT !== 465,
        auth: config.MAIL_USERNAME
            ? { user: config.MAIL_USERNAME, pass: config.MAIL_PASSWORD }
            : undefined,
    });

    return transporter;
}
