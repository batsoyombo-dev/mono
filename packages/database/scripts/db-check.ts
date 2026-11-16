/**
 * `bun run db:check`: fails when `prisma/schema.prisma` and `prisma/migrations` disagree, e.g. a
 * schema change shipped without its migration. It replays the migrations into a shadow database
 * and diffs the result against the schema (`prisma migrate diff --from-migrations`), so the
 * state of the dev database does not matter.
 *
 * The shadow database is `SHADOW_DATABASE_URL` when set (an existing, disposable database that
 * Prisma wipes). Otherwise a throwaway `<db>_shadow_<random>` database is created next to
 * `DATABASE_URL` and dropped afterwards, which needs the CREATE DATABASE privilege (the local
 * docker-compose and CI users have it).
 *
 * Exit codes: 0 in sync, 2 schema and migrations differ (the diff is printed), 1 error.
 */
import { randomBytes } from "node:crypto";

import { Client } from "pg";

// Reads DATABASE_URL and passes the shadow URL on to the Prisma CLI (see prisma.config.ts),
// which is why it is listed in ENV_READERS in @mono/eslint-config/boundaries.
const databaseUrl = process.env.DATABASE_URL;
const configuredShadowUrl = process.env.SHADOW_DATABASE_URL || undefined;

function fail(message: string): never {
    process.stderr.write(`db:check: ${message}\n`);
    process.exit(1);
}

async function withAdmin(url: string, sql: string) {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
        await client.query(sql);
    } finally {
        await client.end();
    }
}

async function diff(shadowUrl: string): Promise<number> {
    const proc = Bun.spawn(
        [
            "prisma",
            "migrate",
            "diff",
            "--from-migrations",
            "prisma/migrations",
            "--to-schema",
            "prisma/schema.prisma",
            "--exit-code",
        ],
        {
            cwd: `${import.meta.dir}/..`,
            env: { ...process.env, SHADOW_DATABASE_URL: shadowUrl },
            stdio: ["inherit", "inherit", "inherit"],
        }
    );
    return proc.exited;
}

async function main(): Promise<number> {
    if (configuredShadowUrl) return diff(configuredShadowUrl);

    if (!databaseUrl) fail("DATABASE_URL is not set (copy .env.example to .env).");

    const base = new URL(databaseUrl);
    const baseName = decodeURIComponent(base.pathname.slice(1)) || "postgres";
    const shadowName = `${baseName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40)}_shadow_${randomBytes(4).toString("hex")}`;
    const shadow = new URL(base);
    shadow.pathname = `/${shadowName}`;

    const drop = async () => {
        try {
            await withAdmin(databaseUrl, `DROP DATABASE IF EXISTS "${shadowName}" WITH (FORCE)`);
        } catch (error) {
            // Never let a failed cleanup replace the diff result.
            const reason = error instanceof Error ? error.message : String(error);
            process.stderr.write(`db:check: could not drop ${shadowName}: ${reason}\n`);
        }
    };

    // Ctrl+C / SIGTERM skip `finally`, so drop the shadow database before exiting (130/143).
    for (const [signal, code] of [
        ["SIGINT", 130],
        ["SIGTERM", 143],
    ] as const) {
        process.once(signal, () => {
            void drop().finally(() => process.exit(code));
        });
    }

    await withAdmin(databaseUrl, `CREATE DATABASE "${shadowName}"`);
    try {
        return await diff(shadow.toString());
    } finally {
        await drop();
    }
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => fail(error instanceof Error ? error.message : String(error))
);
