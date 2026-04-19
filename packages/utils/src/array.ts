/**
 * Returns a new array with duplicate primitive values removed.
 */
export function unique<T>(arr: T[]): T[] {
    return arr.filter((item, index) => arr.indexOf(item) === index);
}

/**
 * Splits an array into chunks of the given size.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

/**
 * Flattens a two-dimensional array into a single array.
 */
export function flatten<T>(arr: T[][]): T[] {
    return arr.reduce((acc, val) => acc.concat(val), [] as T[]);
}

/**
 * Groups array items by a key function.
 */
export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
    return arr.reduce(
        (acc, item) => {
            const key = keyFn(item);
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        },
        {} as Record<string, T[]>
    );
}

/**
 * Returns a new array with items shuffled (Fisher–Yates).
 */
export function shuffle<T>(arr: T[]): T[] {
    const result = arr.slice();
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j] as T, result[i] as T];
    }
    return result;
}
