// Local throwaway Postgres 16 cluster for development & tests (NOT used in production).
// Uses the system's PostgreSQL binaries; no Docker required.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dataDir = process.env.LOCAL_PG_DIR ?? path.join(root, ".localdb");
const port = process.env.LOCAL_PG_PORT ?? "54329";

function pgBin(name) {
  const base = "/usr/lib/postgresql";
  if (existsSync(base)) {
    const versions = readdirSync(base).sort().reverse();
    for (const v of versions) {
      const p = path.join(base, v, "bin", name);
      if (existsSync(p)) return p;
    }
  }
  return name; // fall back to PATH (e.g. Homebrew)
}

// PostgreSQL refuses to run as root (common in containers): drop to the
// "postgres" OS user via runuser when needed.
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
function cmd(bin, args) {
  return asRoot ? ["runuser", ["-u", "postgres", "--", pgBin(bin), ...args]] : [pgBin(bin), args];
}
function run(bin, args, opts = {}) {
  const [c, a] = cmd(bin, args);
  return execFileSync(c, a, { stdio: "inherit", ...opts });
}

function isRunning() {
  const [c, a] = cmd("pg_ctl", ["-D", dataDir, "status"]);
  const r = spawnSync(c, a, { stdio: "ignore" });
  return r.status === 0;
}

export function start() {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    if (asRoot) { mkdirSync(dataDir, { recursive: true }); execFileSync("chown", ["postgres", dataDir]); }
    run("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C.UTF-8"]);
  }
  if (!isRunning()) {
    run("pg_ctl", ["-D", dataDir, "-o", `-p ${port} -k /tmp -c listen_addresses=127.0.0.1`, "-l", path.join(dataDir, "server.log"), "-w", "start"]);
  }
  const exists = spawnSync(pgBin("psql"), ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-tAc", "select 1 from pg_database where datname='academy'"], { encoding: "utf8" });
  if (!exists.stdout?.includes("1")) {
    run("createdb", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "academy"]);
  }
  console.log(`Local Postgres ready: postgres://postgres@127.0.0.1:${port}/academy`);
}

export function stop() {
  if (isRunning()) run("pg_ctl", ["-D", dataDir, "-m", "fast", "stop"]);
}

const action = process.argv[2];
if (action === "start") start();
else if (action === "stop") stop();
