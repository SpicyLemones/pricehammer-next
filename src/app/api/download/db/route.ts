// Download data.sqlite
import fs from "fs";
import path from "path";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_FILE = path.join(process.cwd(), "data", "db", "data.sqlite");

export async function GET() {
  if (!fs.existsSync(DB_FILE)) {
    return new Response(JSON.stringify({ ok: false, error: "data.sqlite not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const stat = fs.statSync(DB_FILE);
  const nodeStream = fs.createReadStream(DB_FILE);
  // Node 18+: convert Node stream → Web stream for Response
  // @ts-ignore
  const webStream: ReadableStream = (Readable as any).toWeb
    ? (Readable as any).toWeb(nodeStream)
    : (nodeStream as unknown as ReadableStream);

  return new Response(webStream, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="data.sqlite"`,
      "content-length": String(stat.size),
      "cache-control": "no-store",
    },
  });
}
