// src/app/api/download/db/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/sql"; // use ONE helper so we stay on the same connection
import fs from "fs";
import os from "os";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Ask SQLite where the *current* connection points
    const pragmaRows: any[] = (await query("all", "PRAGMA database_list")) as any[];
    const main = Array.isArray(pragmaRows) ? pragmaRows.find((r: any) => r?.name === "main") : null;
    const livePath: string =
      main?.file ||
      process.env.DB_PATH ||
      path.resolve(process.cwd(), "data", "db", "data.sqlite");

    // temp location for the snapshot
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dbsnap-"));
    const snapshot = path.join(tmpDir, "data.sqlite");

    try {
      // Flush WAL so readers see latest pages, then create a clean snapshot
      await query("run", "PRAGMA wal_checkpoint(TRUNCATE)");
      const safe = snapshot.replace(/'/g, "''"); // VACUUM can't take parameters
      await query("run", `VACUUM INTO '${safe}'`);
    } catch {
      // Fallback if VACUUM INTO isn't available / is busy.
      // Checkpoint first so the main file is up to date, then copy.
      try { await query("run", "PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
      fs.copyFileSync(livePath, snapshot);
      for (const ext of ["-wal", "-shm"] as const) {
        const src = livePath + ext;
        const dst = snapshot + ext;
        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
      }
    }

    const buf = fs.readFileSync(snapshot);
    return new NextResponse(buf, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="data.sqlite"`,
        "cache-control": "no-store, max-age=0",
        "x-db-source": livePath, // handy for debugging which file we copied
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to export DB" },
      { status: 500 }
    );
  }
}
