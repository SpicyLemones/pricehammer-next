import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";

const DB_PATH = path.join(process.cwd(), "data/db/data.sqlite");
const SQL_ROOT = path.join(process.cwd(), "data/db/queries");

const db = new sqlite3.Database(DB_PATH);

function readSQL(rel: string) {
  return fs.readFileSync(path.join(SQL_ROOT, rel + ".sql"), "utf8");
}

export function query<T = any>(
  type: "run" | "get" | "all" | "each",
  name: string,
  args: any[] = []
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (type === "run") {
      db.run(readSQL(name), args, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    } else if (type === "get") {
      db.get(readSQL(name), args, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    } else if (type === "all") {
      db.all(readSQL(name), args, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    } else {
      db.each(readSQL(name), args, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    }
  });
}

export async function recomputeRemaining(): Promise<number> {
  const rows = await query("all", "select/count_unsorted");
  return rows.length;
}
