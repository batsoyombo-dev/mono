import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@mono/global-config";

import { PrismaClient } from "../generated/prisma/client";

export type DatabaseOptions = {
    /** PostgreSQL connection string. */
    url: string;
};

/** Creates a Prisma client. Use it for a second database or a test database. */
export function createDatabase({ url }: DatabaseOptions): PrismaClient {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** The app's database client. Connections open on the first query, not on import. */
export const prisma = createDatabase({ url: env.database.DATABASE_URL });

export * from "../generated/prisma/client";
