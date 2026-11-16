export type LockErrorCode = "LOCKED" | "LOCK_TIMEOUT";

/**
 * Thrown by `withLock` when the lock is held by someone else (`LOCKED`) or could not be acquired
 * within `waitTimeoutMs` (`LOCK_TIMEOUT`). `toAppError` (`@mono/error-handling`) maps it to a
 * 409 `ConflictError` by its `name` and `code`, so keep both stable.
 */
export class LockError extends Error {
    override readonly name = "LockError";
    readonly code: LockErrorCode;
    readonly key: string;

    constructor(code: LockErrorCode, key: string) {
        super(
            code === "LOCKED"
                ? `Lock "${key}" is held by another process`
                : `Timed out waiting for lock "${key}"`
        );
        this.code = code;
        this.key = key;
    }
}
