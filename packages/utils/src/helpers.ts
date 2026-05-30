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

export function randomString(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
}
