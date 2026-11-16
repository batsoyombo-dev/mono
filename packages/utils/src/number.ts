/**
 * Formats a number as currency, e.g. `formatCurrency(1500, "USD")` -> "$1,500".
 */
export function formatCurrency(
    value: number | string,
    currency = "USD",
    locale?: string,
    maximumFractionDigits = 0
): string {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits,
    }).format(Number(value));
}

/**
 * Formats a percentage given on a 0-100 scale, e.g. `formatPercent(12.5)` -> "12.5%".
 */
export function formatPercent(value: number, locale?: string): string {
    return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
        value / 100
    );
}

/**
 * Formats a number with grouping separators, e.g. `formatNumber(1234567)` -> "1,234,567".
 */
export function formatNumber(value: number | string, locale?: string): string {
    return new Intl.NumberFormat(locale).format(Number(value));
}

/**
 * Formats a number in compact notation, e.g. `formatShortenNumber(1500)` -> "1.5K".
 */
export function formatShortenNumber(value: number | string, locale?: string): string {
    return new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 2,
    }).format(Number(value));
}

const byteUnits = ["B", "KB", "MB", "GB", "TB"];

/**
 * Formats a byte count, e.g. `formatBytes(1536)` -> "1.5 KB".
 */
export function formatBytes(bytes: number): string {
    if (!(bytes > 0)) return "0 B";
    const exponent = Math.min(
        Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024))),
        byteUnits.length - 1
    );
    const value = bytes / 1024 ** exponent;
    return `${Number(value.toFixed(1))} ${byteUnits[exponent]}`;
}
