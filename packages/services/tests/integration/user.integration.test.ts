/**
 * Runs against a real PostgreSQL with migrations applied (`bun run infra:up && bun run db:deploy`).
 * Run with `bun run test:integration`; `bun run test` skips it. Every row this file creates uses
 * a unique email prefix and is deleted afterwards, so it is safe on a shared dev database.
 */
import { afterAll, describe, expect, test } from "bun:test";

import { createDatabase } from "@mono/database";
import { defineEnv } from "@mono/env";
import { NotFoundError } from "@mono/error-handling";

import { createUserService } from "../../src/modules/user/service";
import { UserRepository } from "../../src/repositories/user.repository";

const config = defineEnv("integration-tests", { groups: ["database"] });
const prisma = createDatabase({ url: config.DATABASE_URL });
const users = new UserRepository(prisma);

const run = `it-${crypto.randomUUID().slice(0, 8)}`;
const email = (name: string) => `${run}-${name}@example.com`;
const mine = { email: { startsWith: run } };

async function createUser(name: string) {
    return users.create({ data: { name, email: email(name) } });
}

afterAll(async () => {
    await prisma.user.deleteMany({ where: mine });
    await prisma.$disconnect();
});

describe("UserRepository (PostgreSQL)", () => {
    test("creates, reads, checks existence and updates by id", async () => {
        const created = await createUser("ada");

        expect(await users.getOne({ where: { id: created.id }, select: { email: true } })).toEqual({
            email: email("ada"),
        });
        expect(await users.exists({ id: created.id })).toBe(true);

        const updated = await users.updateById(created.id, { name: "Ada Lovelace" });
        expect(updated.name).toBe("Ada Lovelace");
    });

    test("paginates with totals", async () => {
        await Promise.all(["p1", "p2", "p3"].map(createUser));

        // Plain { page, pageSize }: the repository derives `skip` itself.
        const page = await users.getManyWithPage(
            { page: 2, pageSize: 2 },
            {
                where: { email: { startsWith: `${run}-p` } },
                orderBy: { email: "asc" },
            }
        );

        expect(page.collection.map((user) => user.email)).toEqual([email("p3")]);
        expect(page.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    test("rolls back writes made through a transaction client", async () => {
        await expect(
            prisma.$transaction(async (tx) => {
                await users.create({ data: { name: "tx", email: email("tx") } }, tx);
                throw new Error("rollback");
            })
        ).rejects.toThrow("rollback");

        expect(await users.exists({ email: email("tx") })).toBe(false);
    });

    test("getOneThrow raises NotFoundError and deleteById removes the row", async () => {
        const created = await createUser("gone");
        await users.deleteById(created.id);

        expect(await users.exists({ id: created.id })).toBe(false);
        await expect(users.getOneThrow({ where: { id: created.id } })).rejects.toBeInstanceOf(
            NotFoundError
        );
    });
});

describe("userService with the real repository", () => {
    const service = createUserService({ users });

    test("updates and returns the trimmed profile", async () => {
        const created = await createUser("grace");

        const profile = await service.updateProfile({ actorUserId: created.id, name: "  Grace " });

        expect(profile).toMatchObject({ id: created.id, name: "Grace", email: email("grace") });
        expect((await users.getOneById(created.id))?.name).toBe("Grace");
    });

    test("throws NotFoundError for a user that does not exist", async () => {
        await expect(service.getProfile({ actorUserId: 2_000_000_000 })).rejects.toBeInstanceOf(
            NotFoundError
        );
    });
});
