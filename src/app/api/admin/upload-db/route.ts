// src/app/api/admin/upload-db/route.ts
// Replace the live SQLite database with an uploaded copy (admin only).
// Intended for pushing a locally-curated DB to a fresh persistent disk.
//
// Usage:
//   curl -u $ADMIN_USER:$ADMIN_PASS -F "file=@data/db/data.sqlite" https://<host>/api/admin/upload-db
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { isAuthorizedAdmin } from "@/lib/auth";
import { closeDb, query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "latin1");

function resolveDbPath(): string {
  return process.env.DB_PATH && process.env.DB_PATH.trim() !== ""
    ? path.resolve(process.env.DB_PATH)
    : path.join(process.cwd(), "data", "db", "data.sqlite");
}

export async function POST(req: Request) {
  if (!isAuthorizedAdmin(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let bytes: Buffer;
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ ok: false, error: "missing file field" }, { status: 400 });
      }
      bytes = Buffer.from(await file.arrayBuffer());
    } else {
      bytes = Buffer.from(await req.arrayBuffer());
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `could not read upload: ${e instanceof Error ? e.message : e}` },
      { status: 400 },
    );
  }

  if (bytes.length < 100 || !bytes.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) {
    return NextResponse.json({ ok: false, error: "not a SQLite database file" }, { status: 400 });
  }

  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);

  try {
    fs.mkdirSync(dir, { recursive: true });

    // Close the live connection so we can safely swap the file underneath.
    // Done via sql.ts so it targets the exact handle the app queries with.
    await closeDb();

    // Remove stale WAL/SHM sidecars from the previous database.
    for (const suffix of ["-wal", "-shm"]) {
      try { fs.rmSync(dbPath + suffix, { force: true }); } catch {}
    }

    // Atomic-ish replace: write temp file on the same volume, then rename over.
    const tmp = path.join(dir, `.upload-${Date.now()}.sqlite`);
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, dbPath);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `failed to write db: ${e instanceof Error ? e.message : e}` },
      { status: 500 },
    );
  }

  // Self-verification: query through the app's own connection (reopens the
  // swapped file) and report what it sees, so a stale-handle swap failure
  // can never masquerade as success again.
  let verification: Record<string, unknown> = {};
  try {
    const cols = (await query("all", "PRAGMA table_info(sellers)")) as { name: string }[];
    const products = (await query("get", "SELECT COUNT(*) AS c FROM products")) as { c: number };
    verification = {
      sellerColumns: cols.map((c) => c.name),
      products: products.c,
    };
  } catch (e) {
    verification = { error: `post-swap query failed: ${e instanceof Error ? e.message : e}` };
  }

  return NextResponse.json({ ok: true, path: dbPath, bytes: bytes.length, verification });
}
