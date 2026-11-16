import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        // `prisma generate` does not connect, so it must work without a configured database.
        url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
        // Only `migrate diff --from-migrations` (`bun run db:check`) uses it; scripts/db-check.ts
        // points it at a throwaway database unless SHADOW_DATABASE_URL is already set.
        // An empty value (as in .env.example) means unset; Prisma rejects "" as a URL.
        shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
    },
});
