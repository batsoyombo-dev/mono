/**
 * Converts a string to camelCase.
 */
export function toCamelCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
        .replace(/^(.)/, (_, c) => c.toLowerCase());
}

/**
 * Converts a string to kebab-case.
 */
export function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase();
}

/**
 * Capitalizes the first character of the string.
 */
export function capitalize(str: string): string {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

const cyrillicToLatinMap: { [key: string]: string } = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "yo",
    ж: "j",
    з: "z",
    и: "i",
    й: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    ө: "u",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ү: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sh",
    ъ: "",
    ы: "i",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
};

/**
 * Truncates a string to at most `length` characters, ending with `suffix` when truncated.
 * The result never exceeds `length`; when the suffix does not fit, the string is cut without it.
 */
export function truncate(str: string, length: number, suffix = "..."): string {
    const max = Math.max(0, Math.floor(length));
    if (str.length <= max) return str;
    if (suffix.length >= max) return str.slice(0, max);
    return str.slice(0, max - suffix.length) + suffix;
}

/**
 * Converts a string into a URL-friendly slug.
 */
export function slugify(str: string): string {
    return str
        .toLowerCase()
        .trim()
        .split("")
        .map((char) => cyrillicToLatinMap[char] ?? char)
        .join("")
        .normalize("NFD") // split accented chars into base + diacritic
        .replace(/[\u0300-\u036f]/g, "") // remove diacritics
        .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
