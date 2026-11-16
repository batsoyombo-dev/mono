import { describe, expect, test } from "bun:test";

import { createErrorHandler, ForbiddenError } from "../src";

type Listener = (...args: unknown[]) => void;

function fakeProcess() {
    const listeners = new Map<string, Listener[]>();
    const exits: number[] = [];
    let resolveExit: (code: number) => void = () => {};
    const exited = new Promise<number>((resolve) => (resolveExit = resolve));

    return {
        exits,
        on(event: string, listener: Listener) {
            listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        },
        exit(code: number) {
            exits.push(code);
            resolveExit(code);
        },
        emit(event: string, ...args: unknown[]) {
            for (const listener of listeners.get(event) ?? []) listener(...args);
        },
        /** Resolves with the first exit code. */
        nextExit: () => exited,
    };
}

const silentLogger = { info: () => {}, error: () => {} };
const silentStderr = { write: () => true };

function setup(options?: { shutdownTimeoutMs?: number }) {
    const proc = fakeProcess();
    const handler = createErrorHandler({
        process: proc,
        logger: silentLogger,
        stderr: silentStderr,
    });
    handler.listenToErrorEvents(options);
    return { proc, handler };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("errorHandler", () => {
    test("uncaughtException exits 1 after shutdown handlers, even for trusted errors", async () => {
        const { proc, handler } = setup();
        const calls: string[] = [];
        handler.registerShutdownHandler(async () => {
            await tick();
            calls.push("shutdown");
        });

        proc.emit("uncaughtException", new ForbiddenError());

        expect(await proc.nextExit()).toBe(1);
        expect(calls).toEqual(["shutdown"]);
    });

    test("unhandledRejection of a trusted error does not exit", async () => {
        const { proc } = setup();
        proc.emit("unhandledRejection", new ForbiddenError());
        await tick();
        expect(proc.exits).toEqual([]);
    });

    test("unhandledRejection of an untrusted error exits 1", async () => {
        const { proc } = setup();
        proc.emit("unhandledRejection", new Error("boom"));
        expect(await proc.nextExit()).toBe(1);
    });

    test("SIGTERM exits 0, and 1 when a shutdown handler fails", async () => {
        const ok = setup();
        ok.handler.registerShutdownHandler(() => {});
        ok.proc.emit("SIGTERM");
        expect(await ok.proc.nextExit()).toBe(0);

        const failing = setup();
        failing.handler.registerShutdownHandler(() => {});
        failing.handler.registerShutdownHandler(() => {
            throw new Error("close failed");
        });
        failing.proc.emit("SIGTERM");
        expect(await failing.proc.nextExit()).toBe(1);
    });

    test("forces exit 1 when shutdown exceeds shutdownTimeoutMs", async () => {
        const { proc, handler } = setup({ shutdownTimeoutMs: 20 });
        handler.registerShutdownHandler(() => new Promise<void>(() => {}));

        proc.emit("SIGINT");

        expect(await proc.nextExit()).toBe(1);
    });

    test("terminates only once", async () => {
        const { proc } = setup();
        proc.emit("SIGTERM");
        proc.emit("uncaughtException", new Error("late"));
        await proc.nextExit();
        await tick();
        expect(proc.exits).toEqual([0]);
    });

    test("rejects an invalid shutdownTimeoutMs", () => {
        const handler = createErrorHandler({ process: fakeProcess(), logger: silentLogger });
        expect(() => handler.listenToErrorEvents({ shutdownTimeoutMs: 0 })).toThrow(RangeError);
    });
});
