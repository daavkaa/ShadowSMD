// Starts the local throwaway Postgres (system binaries) and rebuilds a dedicated
// test database from migrations + seed + demo fixtures before the suite.
import { execFileSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";

export default async function setup() {
  const root = path.resolve(__dirname, "../..");
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/academy_test";
  if (!process.env.TEST_DATABASE_URL) {
    execFileSync("node", [path.join(root, "scripts/local-pg.mjs"), "start"], { stdio: "inherit" });
    const admin = postgres("postgres://postgres@127.0.0.1:54329/postgres", { max: 1, onnotice: () => {} });
    const [exists] = await admin`select 1 from pg_database where datname = 'academy_test'`;
    if (!exists) await admin.unsafe("create database academy_test");
    await admin.end();
  }
  execFileSync("node", [path.join(root, "scripts/build-seed.mjs")], { stdio: "inherit" });
  const { migrate } = await import(path.join(root, "scripts/migrate.mjs"));
  await migrate({ url, reset: true, seed: true, demo: true, log: () => {} });
}
