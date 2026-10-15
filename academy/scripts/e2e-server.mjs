// Prepares a fresh E2E database, then starts the production build. Used by playwright.config.ts.
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { migrate } from "./migrate.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const url = process.env.DATABASE_URL;
if (!process.env.E2E_DATABASE_URL) {
  execFileSync("node", [path.join(root, "scripts/local-pg.mjs"), "start"], { stdio: "inherit" });
  const admin = postgres("postgres://postgres@127.0.0.1:54329/postgres", { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = 'academy_e2e'`;
  if (!exists) await admin.unsafe("create database academy_e2e");
  await admin.end();
}
await migrate({ url, reset: true, seed: true, demo: true, log: () => {} });
const child = spawn("npx", ["next", "start", "-p", process.env.PORT ?? "3100"], { stdio: "inherit", cwd: root, env: process.env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
