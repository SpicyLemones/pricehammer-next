import { spawn } from "node:child_process";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const dataPath = path.join(process.cwd(), "data");

  return new Promise<NextResponse>((resolve) => {
    const tar = spawn("tar", ["-czf", "-", "data"], { cwd: process.cwd() });

    tar.on("error", (error) => {
      console.error("Failed to spawn tar", error);
      resolve(
        NextResponse.json(
          { error: "Failed to create archive. Ensure tar is available and the data folder exists." },
          { status: 500 }
        )
      );
    });

    const stream = new ReadableStream({
      start(controller) {
        tar.stdout.on("data", (chunk) => controller.enqueue(chunk));
        tar.stdout.on("end", () => controller.close());
        tar.stdout.on("error", (err) => controller.error(err));
      },
      cancel() {
        tar.kill("SIGTERM");
      },
    });

    const headers = new Headers({
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="chattergrounds-data.tar.gz"`,
      "X-Data-Path": dataPath,
    });

    resolve(new NextResponse(stream, { status: 200, headers }));
  });
}
