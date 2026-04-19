/* eslint-disable @typescript-eslint/no-explicit-any */
// packages/utils/src/object.ts

/**
 * Returns a deep clone of a value.
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Shallow merges two objects into a new object.
 */
export function merge<T, U>(a: T, b: U): T & U {
    return { ...(a as any), ...(b as any) };
}

/**
 * Picks the specified keys from an object.
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result = {} as Pick<T, K>;
    keys.forEach((key) => {
        if (key in obj) {
            (result as any)[key] = obj[key];
        }
    });
    return result;
}

/**
 * Omits the specified keys from an object.
 */
export function omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const result = { ...obj } as any;
    keys.forEach((key) => {
        delete result[key];
    });
    return result;
}

/**
 * Safely gets a nested property value by path.
 * @param obj - Source object.
 * @param path - Dot-separated property path (e.g. "user.address.city").
 * @param fallback - Value to return if any part is undefined.
 */
export function get<T>(obj: any, path: string, fallback?: T): T | undefined {
    const keys = path.split(".");
    let current = obj;
    for (const key of keys) {
        if (current == null || typeof current !== "object" || !(key in current)) {
            return fallback;
        }
        current = current[key];
    }
    return current as T;
}

/**
 * Safely sets a nested property value by path, creating objects as needed.
 * @param obj - Target object.
 * @param path - Dot-separated property path.
 * @param value - Value to set.
 */
export function set(obj: any, path: string, value: any): void {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i] as string;
        if (current[key] == null || typeof current[key] !== "object") {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1] as string] = value;
}

/**
 * Checks if the given object contains all the specified keys.
 *
 * @template T - The type of the object.
 * @param {T} obj - The object to check.
 * @param {Array<keyof T>} keys - An array of keys to check for in the object.
 * @returns {boolean} - Returns true if the object contains all the specified keys, otherwise false.
 */
export function hasKeys<T>(obj: T | null | undefined, keys: (keyof T | string)[]): boolean {
    if (!obj || !keys.length || typeof obj !== "object") {
        return false;
    }

    return keys.every((key) => key in obj);
}

type AnyObject = Record<string, any>;

export function deepMerge<T extends AnyObject, U extends AnyObject>(target: T, source: U): T & U {
    const output = { ...target } as T & U;

    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = (output as AnyObject)[key];

            if (isObject(sourceValue) && isObject(targetValue)) {
                (output as AnyObject)[key] = deepMerge(targetValue, sourceValue);
            } else {
                (output as AnyObject)[key] = sourceValue;
            }
        }
    }

    return output;
}

export function isObject(item: any): item is AnyObject {
    return item !== null && typeof item === "object" && !Array.isArray(item);
}

/**
 * Deeply checks two values for equality.
 * Supports: primitives, Date, RegExp, Array, Object, Map, Set.
 */
export function isEqual(a: any, b: any): boolean {
    // Strict equality or both NaN
    if (a === b) return true;
    if (Number.isNaN(a) && Number.isNaN(b)) return true;

    // Compare Dates
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }

    // Compare RegExps
    if (a instanceof RegExp && b instanceof RegExp) {
        return a.source === b.source && a.flags === b.flags;
    }

    // If both are objects (including arrays, maps, sets)
    if (a && b && typeof a === "object" && typeof b === "object") {
        // Arrays
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!isEqual(a[i], b[i])) return false;
            }
            return true;
        }

        // Map
        if (a instanceof Map && b instanceof Map) {
            if (a.size !== b.size) return false;
            for (const [key, val] of a) {
                if (!b.has(key) || !isEqual(val, b.get(key))) return false;
            }
            return true;
        }

        // Set
        if (a instanceof Set && b instanceof Set) {
            if (a.size !== b.size) return false;
            for (const val of a) {
                // Must find a matching value in b
                let found = false;
                for (const other of b) {
                    if (isEqual(val, other)) {
                        found = true;
                        break;
                    }
                }
                if (!found) return false;
            }
            return true;
        }

        // Plain objects
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!isEqual(a[key], b[key])) return false;
        }
        return true;
    }

    // Fallback (including functions, mismatched types, etc.)
    return false;
}

export function keyBy<T extends Record<string, any>, K extends keyof T>(
    array: T[],
    key: K
): Record<string, T> {
    return array.reduce(
        (acc, item) => {
            acc[item[key] as string] = item;
            return acc;
        },
        {} as Record<string, T>
    );
}
