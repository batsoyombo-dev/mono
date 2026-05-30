export interface EmailOptions {
    to: string;
    subject: string;
    from?: string;
}

export interface PlainTextEmailOptions extends EmailOptions {
    text: string;
}

export interface HtmlEmailOptions extends EmailOptions {
    html: string;
    text?: string;
}

export interface TemplateEmailOptions extends EmailOptions {
    template: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>;
}

export interface AttachmentOptions {
    filename: string;
    content: string | Buffer;
    contentType?: string;
}

export interface EmailWithAttachmentsOptions extends EmailOptions {
    text: string;
    html?: string;
    attachments?: AttachmentOptions[];
}

export interface EmailResult {
    success: boolean;
    messageId?: string;
    message: string;
    provider?: string;
    template?: string;
    attachmentCount?: number;
    error?: string;
}

export interface BulkEmailResult {
    success: boolean;
    total: number;
    sent: number;
    failed: number;
    provider: string;
    results: Array<EmailResult & { index: number; email: string }>;
    errors: Array<{ index: number; email: string; error: string }>;
}

export interface ConnectionTestResult {
    success: boolean;
    message: string;
    provider: string;
    error?: string;
}

export interface ServiceStatus {
    success: boolean;
    service: string;
    environment: string;
    provider: string;
    fromEmail: string;
    timestamp: string;
    error?: string;
}

export type BulkEmailItem = PlainTextEmailOptions | HtmlEmailOptions | TemplateEmailOptions;
