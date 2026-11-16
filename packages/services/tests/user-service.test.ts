import { describe, expect, test } from "bun:test";

import { NotFoundError } from "@mono/error-handling";

import type { UserServiceDeps } from "../src/modules/user/service";
import { createUserService } from "../src/modules/user/service";

const profile = {
    id: 42,
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** An in-memory stand-in for UserRepository: no database, no env. */
function fakeUsers(rows = [profile]) {
    const updates: unknown[] = [];
    const users = {
        getOne: async ({ where }: { where: { id: number } }) =>
            rows.find((row) => row.id === where.id) ?? null,
        exists: async ({ id }: { id: number }) => rows.some((row) => row.id === id),
        update: async ({ where, data }: { where: { id: number }; data: object }) => {
            updates.push({ where, data });
            return { ...rows.find((row) => row.id === where.id)!, ...data };
        },
    } as unknown as UserServiceDeps["users"];

    return { users, updates };
}

describe("userService", () => {
    test("returns the actor's profile", async () => {
        const service = createUserService(fakeUsers());

        expect(await service.getProfile({ actorUserId: 42 })).toEqual(profile);
    });

    test("throws NotFoundError for an unknown user", async () => {
        const service = createUserService(fakeUsers());

        await expect(service.getProfile({ actorUserId: 7 })).rejects.toBeInstanceOf(NotFoundError);
        await expect(
            service.updateProfile({ actorUserId: 7, name: "Grace" })
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    test("validates and trims the update before writing", async () => {
        const { users, updates } = fakeUsers();
        const service = createUserService({ users });

        const updated = await service.updateProfile({ actorUserId: 42, name: "  Grace  " });

        expect(updated.name).toBe("Grace");
        expect(updates).toEqual([{ where: { id: 42 }, data: { name: "Grace" } }]);
    });
});
