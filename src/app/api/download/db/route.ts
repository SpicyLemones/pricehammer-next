// src/app/api/download/db/route.ts
import { NextResponse } from "next/server";
import { all, query } from "@/lib/sql"; // uses your existing DB connection
import fs from "fs";
import os from "os";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1) Ask SQLite which file the CURRENT connection is using
    //    (works regardless of persistent disk vs repo path)
    const pragma = (await all<any>("PRAGMA database_list")) || [];
    const main = pragma.find((r: any) => r?.name === "main");
    const livePath: string =
      main?.file ||
      process.env.DB_PATH ||
      path.resolve(process.cwd(), "data", "db", "data.sqlite");

    // 2) Make a consistent snapshot
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dbsnap-"));
    const snapshot = path.join(tmpDir, "data.sqlite");

    try {
      // Prefer VACUUM INTO for a safe, point-in-time copy
      // Note: can't parameterize the filename in SQLite VACUUM, so escape single quotes
      const safe = snapshot.replace(/'/g, "''");
      await query("run", `VACUUM INTO '${safe}'`);
    } catch {
      // Fallback: best-effort copy (not perfect in WAL mode, but better than failing)
      fs.copyFileSync(livePath, snapshot);
      // if WAL/SHM exist, include them too so SQLite can recover state if needed
      for (const ext of ["-wal", "-shm"] as const) {
        const src = livePath + ext;
        const dst = snapshot + ext;
        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
      }
    }

    // 3) Stream back the snapshot
    const buf = fs.readFileSync(snapshot);
    const headers = new Headers({
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="data.sqlite"`,
      "cache-control": "no-store, max-age=0",
    });
    return new NextResponse(buf, { headers });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to export DB" },
      { status: 500 }
    );
  }
}
