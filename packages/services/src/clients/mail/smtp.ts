/** SMTP connection settings shared by the mail client. Pure: safe to import in tests. */

export type MailEncryption = "auto" | "ssl" | "starttls" | "none";

export type SmtpTimeouts = {
    /** Waiting for the TCP connection. */
    connection: number;
    /** Waiting for the server greeting after connecting. */
    greeting: number;
    /** Inactivity on an open socket. */
    socket: number;
};

/**
 * Short enough that a hung SMTP server fails the send (and the job is retried) well inside the
 * worker's shutdown grace (`WORKER_SHUTDOWN_TIMEOUT_MS`, 25s by default).
 */
export const DEFAULT_SMTP_TIMEOUTS: SmtpTimeouts = {
    connection: 10_000,
    greeting: 10_000,
    socket: 20_000,
};

/** Nodemailer TLS flags for an encryption mode. */
export function tlsOptions(encryption: MailEncryption, port: number) {
    const mode = encryption === "auto" ? (port === 465 ? "ssl" : "starttls") : encryption;
    return {
        secure: mode === "ssl",
        requireTLS: mode === "starttls",
        ignoreTLS: mode === "none",
    };
}
