// Download Data.ts
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_TS = path.join(process.cwd(), "data", "db", "Data.ts");

export async function GET() {
  if (!fs.existsSync(DATA_TS)) {
    return new Response(JSON.stringify({ ok: false, error: "Data.ts not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const text = fs.readFileSync(DATA_TS, "utf8");
  return new Response(text, {
    headers: {
      "content-type": "application/typescript; charset=utf-8",
      "content-disposition": `attachment; filename="Data.ts"`,
      "cache-control": "no-store",
    },
  });
}
