/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Creates a debounced version of a function that delays invoking
 * until after `wait` milliseconds have elapsed since the last call.
 */
export function debounce<F extends (...args: any[]) => void>(
    fn: F,
    wait: number
): (...args: Parameters<F>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<F>) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, wait);
    };
}

/**
 * Creates a throttled version of a function that invokes at most
 * once every `wait` milliseconds.
 */
export function throttle<F extends (...args: any[]) => void>(
    fn: F,
    wait: number
): (...args: Parameters<F>) => void {
    let lastCallTime = 0;
    return (...args: Parameters<F>) => {
        const now = Date.now();
        if (now - lastCallTime >= wait) {
            lastCallTime = now;
            fn(...args);
        }
    };
}

/**
 * Retry a promise-returning function up to `attempts` times,
 * waiting `delayMs` between failures.
 */
export async function retry<T>(
    fn: () => Promise<T>,
    attempts: number,
    delayMs: number
): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (i < attempts - 1) {
                await delay(delayMs);
            }
        }
    }
    throw lastError;
}

/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async function on each element of an array in parallel,
 * returning an array of results.
 */
export async function parallel<T, U>(
    items: T[],
    fn: (item: T, index: number, array: T[]) => Promise<U>
): Promise<U[]> {
    return Promise.all(items.map((item, index) => fn(item, index, items)));
}
