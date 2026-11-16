/**
 * Receives the original slug and a function to check if it exists in DB
 */
export async function makeUniqueSlug(
    base: string,
    exists: (slug: string) => Promise<boolean>
): Promise<string> {
    let slug = base;
    let counter = 2;
    while (await exists(slug)) {
        slug = `${base}-${counter++}`;
    }
    return slug;
}

const randomStringChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Returns a cryptographically random alphanumeric string, safe for tokens and codes.
 */
export function randomString(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    // 248 is the largest multiple of 62 below 256, so rejecting higher bytes avoids modulo bias.
    let result = "";
    for (const byte of bytes) {
        if (byte < 248) result += randomStringChars[byte % randomStringChars.length];
    }
    return result.length === length ? result : result + randomString(length - result.length);
}

export function generateUuid() {
    return crypto.randomUUID();
}
