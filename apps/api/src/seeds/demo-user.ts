import { hashPassword } from "better-auth/crypto";

import { prisma } from "@mono/database";

import type { Seeder } from "./types";

export const DEMO_USER = {
    name: "Demo User",
    email: "demo@example.com",
    password: "password123",
} as const;

/** A verified email/password user for local development. Sign in with DEMO_USER. */
export const demoUserSeeder: Seeder = {
    name: "demo user",
    async run() {
        const user = await prisma.user.upsert({
            where: { email: DEMO_USER.email },
            create: { name: DEMO_USER.name, email: DEMO_USER.email, emailVerified: true },
            update: {},
        });

        await prisma.account.upsert({
            where: {
                providerId_accountId: { providerId: "credential", accountId: String(user.id) },
            },
            create: {
                userId: user.id,
                providerId: "credential",
                accountId: String(user.id),
                password: await hashPassword(DEMO_USER.password),
            },
            update: {},
        });
    },
};
