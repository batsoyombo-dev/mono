/** SMTP connection settings shared by the mail client. Pure: safe to import in tests. */

export type MailEncryption = "auto" | "ssl" | "starttls" | "opportunistic" | "none";

export type SmtpTimeouts = {
    /** Waiting for the TCP connection. */
    connection: number;
    /** Waiting for the server greeting after connecting. */
    greeting: number;
    /** Inactivity on an open socket. */
    socket: number;
};

/**
 * Even back to back (5s + 5s + 10s = 20s), a hung SMTP server fails the send (and the job is
 * retried) inside the worker's shutdown grace (`WORKER_SHUTDOWN_TIMEOUT_MS`, 25s by default),
 * so a send is never cut off mid-way and re-run, which could deliver the email twice.
 */
export const DEFAULT_SMTP_TIMEOUTS: SmtpTimeouts = {
    connection: 5_000,
    greeting: 5_000,
    socket: 10_000,
};

/**
 * Nodemailer TLS flags for an encryption mode. `opportunistic` upgrades with STARTTLS when the
 * server offers it (nodemailer's default); `none` never uses TLS.
 */
export function tlsOptions(encryption: MailEncryption, port: number) {
    const mode = encryption === "auto" ? (port === 465 ? "ssl" : "starttls") : encryption;
    return {
        secure: mode === "ssl",
        requireTLS: mode === "starttls",
        ignoreTLS: mode === "none",
    };
}
