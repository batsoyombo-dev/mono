import { describe, expect, test } from "bun:test";

import { BaseRepository } from "../src/repositories/base.repository";

type Call = { method: string; args: unknown };

/** A Prisma model delegate that records every call and returns the args it received. */
function fakeModel() {
    const calls: Call[] = [];
    const record =
        (method: string) =>
        async (args: unknown): Promise<unknown> => {
            calls.push({ method, args });
            return args;
        };
    const model = Object.fromEntries(
        [
            "findMany",
            "findFirst",
            "count",
            "aggregate",
            "groupBy",
            "update",
            "updateMany",
            "delete",
            "upsert",
        ].map((method) => [method, record(method)])
    );
    return { model, calls };
}

// The base class is generic over Prisma's delegate; `any` stands in for the fake.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class TestRepository extends BaseRepository<any> {
    constructor(model: unknown, softDelete: boolean) {
        super(model, "user", { softDelete }); // any model name; the delegate is a fake
    }
}

function setup(softDelete = true) {
    const { model, calls } = fakeModel();
    return { repo: new TestRepository(model, softDelete), calls };
}

describe("BaseRepository soft delete", () => {
    test("aggregate skips soft-deleted rows", async () => {
        const { repo, calls } = setup();

        await repo.aggregate({ where: { userId: 1 }, _count: true });

        expect(calls).toEqual([
            {
                method: "aggregate",
                args: { where: { userId: 1, deletedAt: null }, _count: true },
            },
        ]);
    });

    test("soft deleteMany keeps options such as limit", async () => {
        const { repo, calls } = setup();

        await repo.deleteMany({ where: { userId: 1 }, limit: 100 });

        expect(calls).toHaveLength(1);
        expect(calls[0]?.method).toBe("updateMany");
        expect(calls[0]?.args).toMatchObject({
            where: { userId: 1, deletedAt: null },
            limit: 100,
            data: { deletedAt: expect.any(Date) },
        });
    });

    test("groupBy skips soft-deleted rows", async () => {
        const { repo, calls } = setup();

        await repo.groupBy({ by: ["userId"], _count: true });

        expect(calls[0]).toEqual({
            method: "groupBy",
            args: { by: ["userId"], _count: true, where: { deletedAt: null } },
        });
    });

    test("delete sets deletedAt and keeps select and include", async () => {
        const { repo, calls } = setup();

        await repo.delete({ where: { id: 1 }, select: { id: true } });
        await repo.delete({ where: { id: 2 }, include: { user: true } });

        expect(calls).toEqual([
            {
                method: "update",
                args: {
                    where: { id: 1, deletedAt: null },
                    select: { id: true },
                    data: { deletedAt: expect.any(Date) },
                },
            },
            {
                method: "update",
                args: {
                    where: { id: 2, deletedAt: null },
                    include: { user: true },
                    data: { deletedAt: expect.any(Date) },
                },
            },
        ]);
    });

    test("upsertById treats a soft-deleted row as missing", async () => {
        const { repo, calls } = setup();

        await repo.upsertById(5, { title: "new" }, { title: "changed" });

        expect(calls).toEqual([
            {
                method: "upsert",
                args: {
                    where: { id: 5, deletedAt: null },
                    create: { title: "new" },
                    update: { title: "changed" },
                },
            },
        ]);
    });

    test("upsert is passed through unchanged", async () => {
        const { repo, calls } = setup();

        await repo.upsert({ where: { id: 5 }, create: {}, update: {} });

        expect(calls[0]?.args).toEqual({ where: { id: 5 }, create: {}, update: {} });
    });

    test("relation filters and includes are not rewritten", async () => {
        const { repo, calls } = setup();

        await repo.getMany({ where: { user: { posts: { some: {} } } }, include: { user: true } });

        // Only the top-level where gets deletedAt: null; relations are the caller's job.
        expect(calls[0]?.args).toEqual({
            where: { user: { posts: { some: {} } }, deletedAt: null },
            include: { user: true },
        });
    });

    test("repositories without soft delete leave queries alone", async () => {
        const { repo, calls } = setup(false);

        await repo.aggregate({ _count: true });
        await repo.delete({ where: { id: 1 }, select: { id: true } });
        await repo.upsertById(1, {}, {});

        expect(calls).toEqual([
            { method: "aggregate", args: { _count: true, where: {} } },
            { method: "delete", args: { where: { id: 1 }, select: { id: true } } },
            { method: "upsert", args: { where: { id: 1 }, create: {}, update: {} } },
        ]);
    });
});
