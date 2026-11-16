import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        // `prisma generate` does not connect, so it must work without a configured database.
        url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
    },
});
