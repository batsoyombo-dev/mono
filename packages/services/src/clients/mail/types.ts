export type EmailOptions = {
    to: string;
    subject: string;
    /** Overrides MAIL_FROM_ADDRESS. */
    from?: string;
};

export type PlainTextEmailOptions = EmailOptions & {
    text: string;
};

export type HtmlEmailOptions = EmailOptions & {
    html: string;
    text?: string;
};

export type TemplateEmailOptions = EmailOptions & {
    /** File name in ./templates without the .hbs extension. */
    template: string;
    data: Record<string, unknown>;
};

export type AttachmentOptions = {
    filename: string;
    content: string | Buffer;
    contentType?: string;
};

export type EmailWithAttachmentsOptions = EmailOptions & {
    text: string;
    html?: string;
    attachments: AttachmentOptions[];
};

export type EmailResult = {
    messageId: string;
};
