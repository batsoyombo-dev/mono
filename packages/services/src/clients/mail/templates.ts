import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import handlebars from "handlebars";
import { z } from "zod";

import { BadRequestError } from "@mono/error-handling";

/**
 * Every template in ./templates, without the .hbs extension. Add a name here when you add a
 * file; a test fails when the list and the folder disagree. Mail jobs validate `template`
 * against this list, so an unknown name fails at enqueue time instead of being retried.
 */
export const MAIL_TEMPLATES = [
    "auth-email-verification",
    "auth-password-reset",
    "default",
] as const;

export const mailTemplateSchema = z.enum(MAIL_TEMPLATES);
export type MailTemplate = z.infer<typeof mailTemplateSchema>;

// In development this resolves next to the source; app builds copy templates into dist/templates.
export const templatesDir = resolve(dirname(fileURLToPath(import.meta.url)), "templates");

const compiledTemplates = new Map<string, HandlebarsTemplateDelegate>();

/**
 * Renders a template with Handlebars (values are HTML-escaped). Throws `BadRequestError` for a
 * name that is not in `MAIL_TEMPLATES`, which a worker does not retry.
 */
export async function renderTemplate(name: string, data: Record<string, unknown>): Promise<string> {
    const parsed = mailTemplateSchema.safeParse(name);
    if (!parsed.success) {
        throw new BadRequestError(`Unknown mail template "${name}"`);
    }

    let template = compiledTemplates.get(parsed.data);
    if (!template) {
        const source = await readFile(resolve(templatesDir, `${parsed.data}.hbs`), "utf8");
        template = handlebars.compile(source);
        compiledTemplates.set(parsed.data, template);
    }

    return template({ currentYear: new Date().getFullYear(), ...data });
}
