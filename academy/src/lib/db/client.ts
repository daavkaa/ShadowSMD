import "server-only";
import postgres from "postgres";
import { getEnv } from "@/lib/env";

/**
 * Database access has exactly two entry points:
 *
 * - withUser(userId, fn): runs fn in a transaction as the Postgres role
 *   "authenticated" (or "anon") with Supabase-compatible JWT claims, so every
 *   query is subject to Row Level Security exactly as a Supabase client would be.
 * - withService(fn): runs fn as the backend owner role (bypasses RLS). Only for
 *   server-side state transitions after explicit authorization checks
 *   (payments, entitlements, scoring, credentials, seat management).
 */
export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const globalForDb = globalThis as unknown as { __academySql?: Sql };

export function db(): Sql {
  if (!globalForDb.__academySql) {
    const env = getEnv();
    globalForDb.__academySql = postgres(env.DATABASE_URL, {
      max: env.stage === "test" ? 4 : 10,
      idle_timeout: 20,
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      onnotice: () => {},
    });
  }
  return globalForDb.__academySql;
}

export async function withUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" });
  return (await db().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx.unsafe(userId ? "set local role authenticated" : "set local role anon");
    return fn(tx);
  })) as T;
}

export async function withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(fn)) as T;
}

export async function closeDb() {
  if (globalForDb.__academySql) {
    await globalForDb.__academySql.end({ timeout: 5 });
    globalForDb.__academySql = undefined;
  }
}
