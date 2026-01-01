import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

const fallbackOptions = [
  "8 hour time out",
  "8 billion seconds time out",
  "Write an apology paragraph in chat",
  "3 year discord ban",
  "Donate 1 sub",
  "Donate 10 gifted sub",
  "Lose half your toadcoins",
  "Lose all your toadcoins",
  "SAVED",
];

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "doubledown.txt");
    const fileContents = await fs.readFile(filePath, "utf8");
    const options = fileContents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return NextResponse.json({ options: options.length > 0 ? options : fallbackOptions });
  } catch (error) {
    console.error("Failed to load double down options", error);
    return NextResponse.json({ options: fallbackOptions, error: "fallback_used" });
  }
}
