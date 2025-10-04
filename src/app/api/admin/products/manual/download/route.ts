import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { isAuthorizedAdmin } from "@/app/lib/auth";
import { readManualProductsFile } from "@/app/lib/manual-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!isAuthorizedAdmin(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { filePath } = await readManualProductsFile();
    const contents = await fs.readFile(filePath, "utf8");
    const filename = path.basename(filePath);

    return new NextResponse(contents, {
      status: 200,
      headers: {
        "Content-Type": "application/typescript; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[product-metadata] Failed to read Product.ts", error);
    return NextResponse.json({ error: "Unable to download Product.ts" }, { status: 500 });
  }
}
