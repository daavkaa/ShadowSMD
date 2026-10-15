// Applies SQL migrations in order. Usage:
//   node scripts/migrate.mjs [--reset] [--seed] [--demo]
// --reset  drops & recreates the public schema (LOCAL ONLY; refused unless the
//          URL points at localhost/127.0.0.1).
// The local Supabase shim (supabase/local) is applied automatically only when
// the target database has no "auth" schema, i.e. never on real Supabase.
import postgres from "postgres";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = new Set(process.argv.slice(2));

export async function migrate({ url, reset = false, seed = false, demo = false, log = console.log } = {}) {
  const dbUrl = url ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const host = new URL(dbUrl).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  try {
    if (reset) {
      if (!isLocal) throw new Error("--reset refused: only allowed against a local database");
      await sql.unsafe("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;");
    }
    const [{ has_auth }] = await sql`select exists(select 1 from pg_namespace where nspname = 'auth') as has_auth`;
    if (!has_auth) {
      if (!isLocal) throw new Error("No auth schema found on a non-local database. Is this really a Supabase project?");
      await sql.unsafe(readFileSync(path.join(root, "supabase/local/000_supabase_shim.sql"), "utf8"));
      log("applied local Supabase shim");
    }
    await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const dir = path.join(root, "supabase/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name));
    for (const f of files) {
      if (applied.has(f)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(path.join(dir, f), "utf8"));
        await tx`insert into public.schema_migrations (name) values (${f})`;
      });
      log(`applied ${f}`);
    }
    // schema_migrations itself must not be readable by clients.
    await sql.unsafe("alter table public.schema_migrations enable row level security; revoke all on public.schema_migrations from anon, authenticated;");
    if (seed) {
      await sql.unsafe(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
      log("applied seed.sql");
    }
    if (demo) {
      if (!isLocal && process.env.ALLOW_DEMO_SEED !== "true") throw new Error("demo users refused on non-local DB (set ALLOW_DEMO_SEED=true to override)");
      const demoFile = path.join(root, "supabase/demo/demo_users.sql");
      if (existsSync(demoFile)) { await sql.unsafe(readFileSync(demoFile, "utf8")); log("applied demo users"); }
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate({ reset: args.has("--reset"), seed: args.has("--seed"), demo: args.has("--demo") }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
