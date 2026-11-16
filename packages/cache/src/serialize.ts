/**
 * JSON with Date and BigInt preserved, so `cache.get` returns what `cache.set` was given.
 * Plain JSON would turn a Prisma row's `createdAt` into a string while its type still says Date.
 */
type Tagged = { $type: "Date" | "BigInt"; value: string };

function isTagged(value: unknown): value is Tagged {
    return (
        typeof value === "object" &&
        value !== null &&
        Object.keys(value).length === 2 &&
        ((value as Tagged).$type === "Date" || (value as Tagged).$type === "BigInt") &&
        typeof (value as Tagged).value === "string"
    );
}

export function serialize(value: unknown): string {
    return JSON.stringify(value, function (this: Record<string, unknown>, key, current: unknown) {
        // `current` has already been through Date#toJSON; the holder still has the original.
        const original = this[key];
        if (original instanceof Date) return { $type: "Date", value: original.toISOString() };
        if (typeof current === "bigint") return { $type: "BigInt", value: current.toString() };
        return current;
    });
}

export function deserialize<T>(text: string): T {
    return JSON.parse(text, (_key, value: unknown) => {
        if (!isTagged(value)) return value;
        return value.$type === "Date" ? new Date(value.value) : BigInt(value.value);
    }) as T;
}
