// src/lib/sql.ts
import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";

/** Absolute paths (adjust if your repo layout changes) */
const DB_PATH = path.join(process.cwd(), "data", "db", "data.sqlite");
const SQL_ROOT = path.join(process.cwd(), "data", "db", "queries");

/** ---- Singleton DB across hot-reloads/dev ---- */
type SqliteDb = sqlite3.Database;
declare global {
  // eslint-disable-next-line no-var
  var __pricehammer_db__: SqliteDb | undefined;
}

function openDb(): SqliteDb {

    console.log("[DB] Using", DB_PATH);
    console.log("[SQL] Root", SQL_ROOT);
  if (global.__pricehammer_db__) return global.__pricehammer_db__;

  // ensure folder exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  // verbose for better stack traces in dev
  sqlite3.verbose();

  const db = new sqlite3.Database(DB_PATH);

  // reasonable defaults for web workloads
  db.serialize(() => {
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
    db.run("PRAGMA busy_timeout = 5000;");
  });

  global.__pricehammer_db__ = db;
  return db;
}

const db = openDb();

/** ---- SQL file cache ---- */
const sqlCache = new Map<string, string>();
export function q(rel: string): string {
  const key = rel.endsWith(".sql") ? rel : `${rel}.sql`;
  if (sqlCache.has(key)) return sqlCache.get(key)!;

  const full = path.join(SQL_ROOT, key);
  if (!fs.existsSync(full)) {
    throw new Error(`[SQL] Query file not found: ${full}`);
  }
  const text = fs.readFileSync(full, "utf8");
  sqlCache.set(key, text);
  return text;
}


/** ---- Core helpers: run/get/all/each ---- */
export function run(sqlOrName: string, params: any[] = []) {
  const sql = looksLikeSql(sqlOrName) ? sqlOrName : q(sqlOrName);
  return new Promise<sqlite3.RunResult>((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

export function get<T = any>(sqlOrName: string, params: any[] = []) {
  const sql = looksLikeSql(sqlOrName) ? sqlOrName : q(sqlOrName);
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row as T | undefined);
    });
  });
}

export function all<T = any>(sqlOrName: string, params: any[] = []) {
  const sql = looksLikeSql(sqlOrName) ? sqlOrName : q(sqlOrName);
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve((rows as T[]) ?? []);
    });
  });
}

/** Proper each: resolves after iteration completes */
export function each<T = any>(sqlOrName: string, params: any[] = []) {
  const sql = looksLikeSql(sqlOrName) ? sqlOrName : q(sqlOrName);
  return new Promise<T[]>((resolve, reject) => {
    const out: T[] = [];
    db.each(
      sql,
      params,
      (_err, row: T) => {
        if (_err) return reject(_err);
        out.push(row);
      },
      (finalErr, count) => {
        if (finalErr) return reject(finalErr);
        resolve(out);
      }
    );
  });
}

/** Small utility: decide if a string is raw SQL or a query file name */
function looksLikeSql(s: string) {
  // Only treat it as raw SQL when it has whitespace (e.g. "SELECT ... FROM ...")
  // File names like "select/all_products" have no spaces.
  return /\s/.test(s) && /\b(select|insert|update|delete|pragma|with|create|drop)\b/i.test(s);
}

/** ---- Convenience helpers you were using ---- */
export async function query<T = any>(
  type: "run" | "get" | "all" | "each",
  nameOrSql: string,
  args: any[] = []
): Promise<any> {
  if (type === "run") return run(nameOrSql, args);
  if (type === "get") return get<T>(nameOrSql, args);
  if (type === "all") return all<T>(nameOrSql, args);
  return each<T>(nameOrSql, args);
}

export async function recomputeRemaining(): Promise<number> {
  const rows = await all(q("select/count_unsorted.sql"));
  return rows.length;
}

/** Optional: quick transaction helper */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await run("BEGIN");
  try {
    const v = await fn();
    await run("COMMIT");
    return v;
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }
}

/** Expose for debugging if needed */
export const DB_FILE_PATH = DB_PATH;
