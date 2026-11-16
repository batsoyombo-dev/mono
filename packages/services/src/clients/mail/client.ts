import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import handlebars from "handlebars";
import type { SendMailOptions } from "nodemailer";

import { config } from "@mono/global-config";

import { getMailTransporter } from "../../utils/mail";
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

    return template({
        appName: config.APP_NAME,
        baseUrl: config.BASE_URL,
        currentYear: new Date().getFullYear(),
        ...data,
    });
}

async function send(options: SendMailOptions): Promise<EmailResult> {
    const result = await getMailTransporter().sendMail({
        ...options,
        from: options.from ?? { name: config.MAIL_FROM_NAME, address: config.MAIL_FROM_ADDRESS },
    });

    return { messageId: result.messageId };
}

export const mailClient = {
    sendPlainText({ to, subject, from, text }: PlainTextEmailOptions) {
        return send({ to, subject, from, text });
    },

    sendHtml({ to, subject, from, html, text }: HtmlEmailOptions) {
        return send({ to, subject, from, html, text: text ?? stripHtml(html) });
    },

    async sendTemplate({ to, subject, from, template, data }: TemplateEmailOptions) {
        const html = await renderTemplate(template, data);
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
        await getMailTransporter().verify();
    },
};
