import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";

import { BadRequestError } from "@mono/error-handling";

import { tlsOptions } from "../src/clients/mail/smtp";
import { MAIL_TEMPLATES, renderTemplate, templatesDir } from "../src/clients/mail/templates";
import { mailSchema } from "../src/queues/default/schemas";

const job = {
    to: "ada@example.com",
    subject: "Hi",
    data: { resetUrl: "https://example.com/reset" },
};

describe("mail templates", () => {
    test("MAIL_TEMPLATES lists exactly the files in ./templates", async () => {
        const files = (await readdir(templatesDir))
            .filter((file) => file.endsWith(".hbs"))
            .map((file) => file.slice(0, -".hbs".length));

        expect(files.toSorted()).toEqual([...MAIL_TEMPLATES].toSorted());
    });

    test("renders a template with its data, HTML-escaped", async () => {
        const html = await renderTemplate("auth-password-reset", {
            appName: "Mono",
            recipientName: "<Ada>",
            resetUrl: "https://example.com/reset?token=abc",
        });

        expect(html).toContain('href="https://example.com/reset?token&#x3D;abc"');
        expect(html).toContain("Hello &lt;Ada&gt;,");
        expect(html).toContain("reset your Mono password");
    });

    test("rejects unknown templates with a 400, which a worker does not retry", async () => {
        await expect(renderTemplate("../secrets", {})).rejects.toBeInstanceOf(BadRequestError);
        await expect(renderTemplate("missing", {})).rejects.toBeInstanceOf(BadRequestError);
    });

    test("the mail job schema only accepts existing templates", () => {
        expect(mailSchema.safeParse({ ...job, template: "auth-password-reset" }).success).toBe(
            true
        );
        expect(mailSchema.safeParse({ ...job, template: "nope" }).success).toBe(false);
    });

    test("the mail job schema accepts a list of keys to redact", () => {
        expect(
            mailSchema.parse({ ...job, template: "default", redact: ["resetUrl"] }).redact
        ).toEqual(["resetUrl"]);
        expect(mailSchema.safeParse({ ...job, template: "default", redact: [""] }).success).toBe(
            false
        );
    });
});

describe("SMTP encryption", () => {
    test("maps each mode to nodemailer's TLS flags", () => {
        expect(tlsOptions("ssl", 587)).toEqual({
            secure: true,
            requireTLS: false,
            ignoreTLS: false,
        });
        expect(tlsOptions("starttls", 465)).toEqual({
            secure: false,
            requireTLS: true,
            ignoreTLS: false,
        });
        expect(tlsOptions("none", 465)).toEqual({
            secure: false,
            requireTLS: false,
            ignoreTLS: true,
        });
        expect(tlsOptions("opportunistic", 587)).toEqual({
            secure: false,
            requireTLS: false,
            ignoreTLS: false,
        });
        expect(tlsOptions("auto", 465)).toEqual({
            secure: true,
            requireTLS: false,
            ignoreTLS: false,
        });
        expect(tlsOptions("auto", 587)).toEqual({
            secure: false,
            requireTLS: true,
            ignoreTLS: false,
        });
    });
});
