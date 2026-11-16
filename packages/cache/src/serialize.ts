/**
 * JSON that keeps the types a Prisma row carries, so `cache.get` returns what `cache.set` was
 * given. Plain JSON would turn `createdAt` into a string while its type still says Date.
 *
 * | Value                   | Comes back as                                                  |
 * | ----------------------- | -------------------------------------------------------------- |
 * | `Date` (also invalid)   | `Date` (an invalid date stays invalid)                         |
 * | `bigint`                | `bigint`                                                       |
 * | `Buffer`                | `Buffer`                                                       |
 * | `Uint8Array` (Bytes)    | `Uint8Array`                                                   |
 * | Prisma `Decimal`        | **string** with the exact decimal text (`"12.50"`); this package |
 * |                         | may not import Prisma, so wrap it: `new Prisma.Decimal(value)` |
 *
 * Special values are stored as `{ "\u0000cache": "<type>", "v": ... }`. The key starts with a
 * NUL character, which PostgreSQL text and JSON cannot contain, and any user object that does
 * own that key is escaped on write, so user data is never mistaken for a tagged value.
 */
const TAG = "\u0000cache";

type TagType = "Date" | "BigInt" | "Bytes" | "Buffer" | "Object";
type Tagged = { [TAG]: TagType; v: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const hasTag = (value: unknown): value is Tagged => isRecord(value) && Object.hasOwn(value, TAG);

const tag = (type: TagType, v: unknown): Tagged => ({ [TAG]: type, v });

export function serialize(value: unknown): string {
    // Escape wrappers created during this call; their `v` is user data that must not be re-wrapped.
    const wrappers = new WeakSet<object>();

    return JSON.stringify(value, function (this: unknown, key, current: unknown) {
        // `current` has already been through `toJSON` (Date, Buffer, Decimal); the holder still
        // has the original.
        const original = isRecord(this) ? this[key] : current;

        if (original instanceof Date) {
            return tag("Date", Number.isNaN(original.getTime()) ? null : original.toISOString());
        }
        if (typeof original === "bigint") return tag("BigInt", original.toString());
        if (original instanceof Uint8Array) {
            const base64 = Buffer.from(
                original.buffer,
                original.byteOffset,
                original.byteLength
            ).toString("base64");
            return tag(Buffer.isBuffer(original) ? "Buffer" : "Bytes", base64);
        }
        if (hasTag(current) && !(key === "v" && isRecord(this) && wrappers.has(this))) {
            const wrapper = tag("Object", current);
            wrappers.add(wrapper);
            return wrapper;
        }
        return current;
    });
}

function reviveTagged(value: Tagged): unknown {
    const { v } = value;
    switch (value[TAG]) {
        case "Date":
            return typeof v === "string" ? new Date(v) : new Date(Number.NaN);
        case "BigInt":
            return BigInt(v as string);
        case "Bytes":
            return new Uint8Array(Buffer.from(v as string, "base64"));
        case "Buffer":
            return Buffer.from(v as string, "base64");
        case "Object":
            return reviveChildren(v as Record<string, unknown>);
        default:
            return value;
    }
}

function reviveChildren(value: Record<string, unknown> | unknown[]): unknown {
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) value[index] = revive(value[index]);
        return value;
    }
    for (const key of Object.keys(value)) {
        const revived = revive(value[key]);
        if (revived !== value[key]) {
            // defineProperty, not assignment: a JSON key named `__proto__` must stay a plain key.
            Object.defineProperty(value, key, {
                value: revived,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        }
    }
    return value;
}

// Top-down (unlike a JSON.parse reviver, which runs bottom-up), so an escaped object's content
// is never itself read as a tag.
function revive(value: unknown): unknown {
    if (!isRecord(value)) return value;
    if (hasTag(value)) return reviveTagged(value);
    return reviveChildren(value);
}

export function deserialize<T>(text: string): T {
    return revive(JSON.parse(text)) as T;
}
