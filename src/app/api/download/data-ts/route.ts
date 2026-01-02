// src/app/api/download/data/route.ts
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveDataTs(): string | null {
  const candidates = [
    path.join(process.cwd(), "data", "db", "Data.ts"),
    path.join(process.cwd(), "src", "data", "db", "Data.ts"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function GET() {
  try {
    const DATA_TS = resolveDataTs();
    if (!DATA_TS) {
      return new Response(
        JSON.stringify({ ok: false, error: "Data.ts not found in known locations" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    const text = fs.readFileSync(DATA_TS, "utf8");
    const stat = fs.statSync(DATA_TS);
    const etag = `"${stat.size}-${stat.mtimeMs}"`;

    return new Response(text, {
      headers: {
        "content-type": "application/typescript; charset=utf-8",
        "content-disposition": `attachment; filename="Data.ts"`,
        "cache-control": "no-store, max-age=0",
        etag,
      },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Failed to read Data.ts" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
